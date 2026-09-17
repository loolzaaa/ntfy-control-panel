<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import client from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import TokenQrModal from '../components/TokenQrModal.vue';

const { t } = useI18n();
const errText = useErrorText();
const auth = useAuthStore();
const toast = useToastStore();

const tokens = ref([]);
const ntfyUserExists = ref(true);
const maxTokens = ref(4);
const loading = ref(true);
const loadError = ref(null);

const newLabel = ref('');
const newExpires = ref('');
const createBusy = ref(false);
const createdToken = ref(null);

const qrToken = ref(null);
const tokenToDelete = ref(null);
const deleteBusy = ref(false);

const errorText = computed(() => errText(loadError.value));
const limitReached = computed(() => tokens.value.length >= maxTokens.value);

function mask(token) {
  if (!token) {
    return '';
  }
  return token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : `${token.slice(0, 4)}***`;
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const { data } = await client.get('/me/tokens');
    tokens.value = data.tokens || [];
    ntfyUserExists.value = data.ntfyUserExists !== false;
    maxTokens.value = data.maxTokens || maxTokens.value;
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  newLabel.value = auth.username;
  load();
});

async function createToken() {
  createBusy.value = true;
  createdToken.value = null;
  try {
    const { data } = await client.post('/me/tokens', {
      label: newLabel.value.trim() || auth.username,
      expires: newExpires.value.trim(),
    });
    createdToken.value = data.token;
    newExpires.value = '';
    toast.success(t('profile.created'));
    await load();
  } catch (err) {
    toast.error(errText(err));
  } finally {
    createBusy.value = false;
  }
}

async function copyToken(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(t('profile.copied'));
  } catch {
    toast.error(t('profile.copyFailed'));
  }
}

async function runDelete() {
  if (!tokenToDelete.value) {
    return;
  }
  deleteBusy.value = true;
  const token = tokenToDelete.value;
  try {
    await client.delete(`/me/tokens/${encodeURIComponent(token.value)}`);
    toast.success(t('profile.deleted'));
    tokenToDelete.value = null;
    await load();
  } catch (err) {
    toast.error(errText(err));
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div class="page-head">
    <h1>{{ t('profile.title') }}</h1>
  </div>

  <div class="card" style="padding: 16px; margin-bottom: 16px">
    <div class="toolbar" style="margin-bottom: 0">
      <span class="badge" :class="auth.isAdmin ? 'badge--admin' : 'badge--user'">
        {{ t(`roles.${auth.role}`) }}
      </span>
      <span class="muted">{{ auth.username }}</span>
      <span class="badge">{{ t('profile.limit', { used: tokens.length, max: maxTokens }) }}</span>
    </div>
  </div>

  <div class="card" style="padding: 16px; margin-bottom: 16px">
    <div v-if="!ntfyUserExists" class="empty-state" style="padding: 12px 0">
      {{ t('profile.ntfyUserMissing') }}
    </div>
    <template v-else>
      <div class="inline-form" style="margin-bottom: 0">
        <div class="field">
          <label for="self-label">{{ t('profile.label') }}</label>
          <input id="self-label" v-model="newLabel" type="text" autocomplete="off" />
        </div>
        <div class="field">
          <label for="self-expires">{{ t('profile.expires') }}</label>
          <input
            id="self-expires"
            v-model="newExpires"
            type="text"
            autocomplete="off"
            :placeholder="t('profile.expiresPlaceholder')"
          />
        </div>
        <button class="btn" type="button" :disabled="createBusy || limitReached" @click="createToken">
          {{ createBusy ? t('profile.creating') : t('profile.create') }}
        </button>
      </div>
      <p v-if="limitReached" class="form-hint" style="margin-top: 10px">
        {{ t('profile.limitReached') }}
      </p>
    </template>
  </div>

  <div v-if="createdToken" class="card" style="padding: 16px; margin-bottom: 16px">
    <p class="muted" style="margin-top: 0">{{ t('profile.createdWarning') }}</p>
    <div class="token-value">{{ createdToken.value }}</div>
    <div style="display: flex; gap: 8px; margin-top: 12px">
      <button class="btn btn--secondary btn--sm" type="button" @click="copyToken(createdToken.value)">
        {{ t('common.copy') }}
      </button>
      <button class="btn btn--secondary btn--sm" type="button" @click="qrToken = createdToken">
        {{ t('qr.button') }}
      </button>
    </div>
  </div>

  <div class="card">
    <div v-if="loading" class="empty-state">{{ t('common.loading') }}</div>
    <div v-else-if="errorText" class="empty-state">{{ errorText }}</div>
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>{{ t('profile.columns.token') }}</th>
            <th>{{ t('profile.columns.label') }}</th>
            <th>{{ t('profile.columns.expires') }}</th>
            <th class="hide-sm">{{ t('profile.columns.lastAccess') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in tokens" :key="token.value">
            <td>
              <span class="token-value">{{ mask(token.value) }}</span>
              <button class="btn btn--ghost btn--sm" type="button" @click="copyToken(token.value)">
                {{ t('common.copy') }}
              </button>
            </td>
            <td>{{ token.label || '—' }}</td>
            <td class="nowrap">{{ token.expires }}</td>
            <td class="hide-sm nowrap">
              {{ token.lastAccess }}
              <span v-if="token.lastOrigin" class="muted">({{ token.lastOrigin }})</span>
            </td>
            <td class="text-right nowrap">
              <button class="btn btn--ghost btn--sm" type="button" @click="qrToken = token">
                {{ t('qr.button') }}
              </button>
              <button class="btn btn--ghost btn--sm" type="button" @click="tokenToDelete = token">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="tokens.length === 0">
            <td colspan="5" class="empty-state">{{ t('profile.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <TokenQrModal v-if="qrToken" :value="qrToken.value" :label="qrToken.label" @close="qrToken = null" />

  <ConfirmDialog
    v-if="tokenToDelete"
    :title="t('profile.deleteTitle')"
    :message="
      t('profile.deleteMessage', {
        token: mask(tokenToDelete.value),
        label: tokenToDelete.label ? ` (${tokenToDelete.label})` : '',
      })
    "
    :confirm-text="t('common.delete')"
    :busy="deleteBusy"
    @close="tokenToDelete = null"
    @confirm="runDelete"
  />
</template>
