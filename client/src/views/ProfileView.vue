<script setup>
import { computed, onMounted, ref, watch } from 'vue';
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
const grants = ref([]);
const defaultAccess = ref(null);

const newLabel = ref('');
const newExpires = ref('');
const createBusy = ref(false);
const createdToken = ref(null);

const qrToken = ref(null);
const tokenToDelete = ref(null);
const deleteBusy = ref(false);

const customPassword = ref('');
const passwordBusy = ref(false);
const createdPassword = ref(null);
const showPasswordQr = ref(false);

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

async function loadAccess() {
  try {
    const { data } = await client.get('/me/access');
    grants.value = data.grants || [];
    defaultAccess.value = data.defaultAccess || null;
  } catch {
    grants.value = [];
    defaultAccess.value = null;
  }
}

onMounted(() => {
  newLabel.value = auth.username;
  load();
  loadAccess();
});

watch(tokens, (list) => {
  if (createdToken.value && !list.some((item) => item.value === createdToken.value.value)) {
    createdToken.value = null;
  }
  if (qrToken.value && !list.some((item) => item.value === qrToken.value.value)) {
    qrToken.value = null;
  }
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

async function changeNtfyPassword() {
  passwordBusy.value = true;
  createdPassword.value = null;
  try {
    await auth.changeNtfyPassword(customPassword.value);
    toast.success(t('profile.ntfyPassword.updated'));
    customPassword.value = '';
  } catch (err) {
    toast.error(errText(err));
  } finally {
    passwordBusy.value = false;
  }
}

async function generateNtfyPassword() {
  passwordBusy.value = true;
  createdPassword.value = null;
  try {
    const data = await auth.generateNtfyPassword();
    createdPassword.value = data.password;
    toast.success(t('profile.ntfyPassword.generated'));
  } catch (err) {
    toast.error(errText(err));
  } finally {
    passwordBusy.value = false;
  }
}

async function copyPassword(value) {
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
    if (createdToken.value && createdToken.value.value === token.value) {
      createdToken.value = null;
    }
    if (qrToken.value && qrToken.value.value === token.value) {
      qrToken.value = null;
    }
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

  <div v-if="!auth.isLocal" class="card" style="padding: 16px; margin-bottom: 16px">
    <div class="section__head" style="padding: 0">
      <h3>{{ t('profile.ntfyPassword.title') }}</h3>
    </div>
    <p class="form-hint" style="margin: 0 0 12px">{{ t('profile.ntfyPassword.hint') }}</p>

    <div v-if="!ntfyUserExists" class="empty-state" style="padding: 12px 0">
      {{ t('profile.ntfyPassword.missing') }}
    </div>
    <template v-else>
      <div v-if="createdPassword" class="card" style="padding: 14px; margin-bottom: 14px">
        <div class="form-hint" style="margin-bottom: 6px">{{ t('profile.ntfyPassword.newPassword') }}</div>
        <div class="token-value">{{ createdPassword }}</div>
        <div style="display: flex; gap: 8px; margin-top: 10px">
          <button class="btn btn--secondary btn--sm" type="button" @click="copyPassword(createdPassword)">
            {{ t('common.copy') }}
          </button>
          <button class="btn btn--secondary btn--sm" type="button" @click="showPasswordQr = true">
            {{ t('qr.button') }}
          </button>
        </div>
      </div>

      <div class="inline-form" style="margin-bottom: 0">
        <div class="field">
          <label for="self-password">{{ t('profile.ntfyPassword.newLabel') }}</label>
          <input
            id="self-password"
            v-model="customPassword"
            type="password"
            autocomplete="new-password"
            :placeholder="t('profile.ntfyPassword.newPlaceholder')"
          />
        </div>
        <button
          class="btn"
          type="button"
          :disabled="passwordBusy || customPassword.length < 8"
          @click="changeNtfyPassword"
        >
          {{ passwordBusy ? t('common.saving') : t('profile.ntfyPassword.change') }}
        </button>
        <button class="btn btn--secondary" type="button" :disabled="passwordBusy" @click="generateNtfyPassword">
          {{ t('profile.ntfyPassword.generate') }}
        </button>
      </div>
    </template>
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
              <button
                class="token-value token-value--copy"
                type="button"
                :title="t('common.copy')"
                @click="copyToken(token.value)"
              >
                {{ mask(token.value) }}
              </button>
            </td>
            <td>{{ token.label || '—' }}</td>
            <td class="nowrap">{{ token.expires }}</td>
            <td class="hide-sm nowrap">
              {{ token.lastAccess }}
              <span v-if="token.lastOrigin" class="muted">({{ token.lastOrigin }})</span>
            </td>
            <td class="text-right nowrap">
              <span class="row-actions">
                <button class="btn btn--ghost btn--sm" type="button" @click="qrToken = token">
                  {{ t('qr.button') }}
                </button>
                <button class="btn btn--ghost btn--sm" type="button" @click="tokenToDelete = token">
                  {{ t('common.delete') }}
                </button>
              </span>
            </td>
          </tr>
          <tr v-if="tokens.length === 0">
            <td colspan="5" class="empty-state">{{ t('profile.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card" style="margin-top: 16px">
    <div class="section__head" style="padding: 16px 16px 0">
      <h3>{{ t('profile.accessTitle') }}</h3>
    </div>
    <div class="table-wrap">
      <table class="data data--compact">
        <thead>
          <tr>
            <th>{{ t('profile.accessTopic') }}</th>
            <th>{{ t('profile.accessPermission') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grant in grants" :key="grant.topic">
            <td><span class="token-value">{{ grant.topic }}</span></td>
            <td>{{ t(`permissions.${grant.permission}`) }}</td>
          </tr>
          <tr v-if="grants.length === 0">
            <td colspan="2" class="empty-state">{{ t('profile.accessEmpty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="defaultAccess" class="form-hint" style="padding: 0 16px 16px">
      {{ t('profile.accessDefault', { permission: t(`permissions.${defaultAccess}`) }) }}
    </p>
  </div>

  <TokenQrModal v-if="qrToken" :value="qrToken.value" :label="qrToken.label" @close="qrToken = null" />

  <TokenQrModal
    v-if="showPasswordQr && createdPassword"
    :value="createdPassword"
    :label="auth.username"
    :title="t('profile.ntfyPassword.qrTitle')"
    :hint="t('profile.ntfyPassword.qrHint')"
    :copied-text="t('profile.copied')"
    :copy-failed-text="t('profile.copyFailed')"
    @close="showPasswordQr = false"
  />

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
