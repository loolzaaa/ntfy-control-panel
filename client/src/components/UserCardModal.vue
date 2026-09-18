<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import TokenQrModal from './TokenQrModal.vue';
import client from '../api/client';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';
import { PERMISSION_OPTIONS } from '../constants';

const props = defineProps({
  username: { type: String, required: true },
});

const emit = defineEmits(['close', 'changed']);

const { t } = useI18n();
const errText = useErrorText();
const toast = useToastStore();

const loading = ref(true);
const loadError = ref(null);
const user = ref(null);
const tokens = ref([]);
const maxTokens = ref(4);

const newTokenLabel = ref('');
const newTokenExpires = ref('');
const tokenBusy = ref(false);
const createdToken = ref(null);

const newTopic = ref('');
const newPermission = ref('read-only');
const accessBusy = ref(false);

const confirmState = ref(null);
const confirmBusy = ref(false);
const qrToken = ref(null);

const isAnonymous = computed(() => Boolean(user.value && user.value.anonymous));
const isAdmin = computed(() => Boolean(user.value && user.value.admin));
const canManage = computed(() => !isAnonymous.value);
const tokenLimitReached = computed(() => tokens.value.length >= maxTokens.value);

const errorText = computed(() => errText(loadError.value));

const endpoint = computed(() => `/users/${encodeURIComponent(props.username)}`);

function permissionLabel(permission) {
  return t(`permissions.${permission}`);
}

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
    const { data } = await client.get(endpoint.value);
    user.value = data.user;
    tokens.value = data.tokens || [];
    maxTokens.value = data.maxTokens || maxTokens.value;
    if (!newTokenLabel.value) {
      newTokenLabel.value = data.user.anonymous ? '' : data.user.name;
    }
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function addToken() {
  tokenBusy.value = true;
  createdToken.value = null;
  try {
    const { data } = await client.post(`${endpoint.value}/tokens`, {
      label: newTokenLabel.value.trim(),
      expires: newTokenExpires.value.trim(),
    });
    createdToken.value = data.token;
    newTokenExpires.value = '';
    toast.success(t('userCard.tokens.created'));
    await load();
    emit('changed');
  } catch (err) {
    toast.error(errText(err));
  } finally {
    tokenBusy.value = false;
  }
}

async function copyToken(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(t('userCard.tokens.copied'));
  } catch {
    toast.error(t('userCard.tokens.copyFailed'));
  }
}

function askDeleteToken(token) {
  confirmState.value = {
    title: t('userCard.tokens.deleteOneTitle'),
    message: t('userCard.tokens.deleteOneMessage', {
      token: mask(token.value),
      label: token.label ? ` (${token.label})` : '',
    }),
    confirmText: t('common.delete'),
    run: async () => {
      await client.delete(`${endpoint.value}/tokens/${encodeURIComponent(token.value)}`);
      if (createdToken.value && createdToken.value.value === token.value) {
        createdToken.value = null;
      }
      if (qrToken.value && qrToken.value.value === token.value) {
        qrToken.value = null;
      }
      toast.success(t('userCard.tokens.deleted'));
      await load();
      emit('changed');
    },
  };
}

function askDeleteAllTokens() {
  confirmState.value = {
    title: t('userCard.tokens.deleteAllTitle'),
    message: t('userCard.tokens.deleteAllMessage', { name: props.username }),
    confirmText: t('userCard.tokens.deleteAll'),
    run: async () => {
      const { data } = await client.delete(`${endpoint.value}/tokens`);
      createdToken.value = null;
      qrToken.value = null;
      toast.success(t('userCard.tokens.deleteAllDone', { count: data.count }));
      await load();
      emit('changed');
    },
  };
}

async function addAccess() {
  accessBusy.value = true;
  try {
    await client.put(`${endpoint.value}/access`, {
      topic: newTopic.value.trim(),
      permission: newPermission.value,
    });
    toast.success(t('userCard.access.assigned'));
    newTopic.value = '';
    await load();
    emit('changed');
  } catch (err) {
    toast.error(errText(err));
  } finally {
    accessBusy.value = false;
  }
}

async function changePermission(grant, permission) {
  try {
    await client.put(`${endpoint.value}/access`, { topic: grant.topic, permission });
    toast.success(t('userCard.access.updated'));
    await load();
    emit('changed');
  } catch (err) {
    toast.error(errText(err));
    await load();
  }
}

function askDeleteAccess(grant) {
  confirmState.value = {
    title: t('userCard.access.deleteTitle'),
    message: t('userCard.access.deleteMessage', { name: props.username, topic: grant.topic }),
    confirmText: t('common.delete'),
    run: async () => {
      await client.delete(`${endpoint.value}/access`, { params: { topic: grant.topic } });
      toast.success(t('userCard.access.deleted'));
      await load();
      emit('changed');
    },
  };
}

async function runConfirm() {
  if (!confirmState.value) {
    return;
  }
  confirmBusy.value = true;
  try {
    await confirmState.value.run();
    confirmState.value = null;
  } catch (err) {
    toast.error(errText(err));
  } finally {
    confirmBusy.value = false;
  }
}
</script>

<template>
  <BaseModal :title="t('userCard.title', { name: props.username })" size="lg" @close="emit('close')">
    <div v-if="loading" class="empty-state">{{ t('common.loading') }}</div>
    <div v-else-if="errorText" class="empty-state">{{ errorText }}</div>

    <template v-else-if="user">
      <div class="toolbar" style="margin-bottom: 20px">
        <span class="badge" :class="isAdmin ? 'badge--admin' : 'badge--user'">
          {{ t(`roles.${user.role}`) }}
        </span>
        <span v-if="isAnonymous" class="badge badge--anon">{{ t('userCard.anonymousBadge') }}</span>
        <span v-if="user.tier" class="badge">{{ t('userCard.tierBadge', { tier: user.tier }) }}</span>
        <span v-if="user.provisioned" class="badge badge--provisioned">
          {{ t('userCard.provisionedBadge') }}
        </span>
      </div>

      <div v-if="isAnonymous" class="empty-state" style="padding: 12px 0 20px">
        {{ t('userCard.anonymousNotice') }}
      </div>

      <!-- Tokens -->
      <section v-if="canManage" class="section">
        <div class="section__head">
          <h3>{{ t('userCard.tokens.heading') }}</h3>
          <button
            class="btn btn--danger btn--sm"
            type="button"
            :disabled="tokens.length === 0"
            @click="askDeleteAllTokens"
          >
            {{ t('userCard.tokens.deleteAll') }}
          </button>
        </div>

        <div class="inline-form">
          <div class="field">
            <label for="token-label">{{ t('userCard.tokens.label') }}</label>
            <input id="token-label" v-model="newTokenLabel" type="text" autocomplete="off" />
          </div>
          <div class="field">
            <label for="token-expires">{{ t('userCard.tokens.expires') }}</label>
            <input
              id="token-expires"
              v-model="newTokenExpires"
              type="text"
              autocomplete="off"
              :placeholder="t('userCard.tokens.expiresPlaceholder')"
            />
          </div>
          <button class="btn" type="button" :disabled="tokenBusy || tokenLimitReached" @click="addToken">
            {{ tokenBusy ? t('userCard.tokens.attaching') : t('userCard.tokens.attach') }}
          </button>
        </div>

        <p v-if="tokenLimitReached" class="form-hint" style="margin: 0 0 12px">
          {{ t('profile.limitReached') }}
        </p>

        <div v-if="createdToken" class="card" style="padding: 14px; margin-bottom: 14px">
          <div class="token-value">{{ createdToken.value }}</div>
          <div style="display: flex; gap: 8px; margin-top: 10px">
            <button class="btn btn--secondary btn--sm" type="button" @click="copyToken(createdToken.value)">
              {{ t('userCard.tokens.copy') }}
            </button>
            <button class="btn btn--secondary btn--sm" type="button" @click="qrToken = createdToken">
              {{ t('qr.button') }}
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>{{ t('userCard.tokens.token') }}</th>
                <th>{{ t('userCard.tokens.label') }}</th>
                <th>{{ t('userCard.tokens.expires') }}</th>
                <th class="hide-sm">{{ t('userCard.tokens.lastAccess') }}</th>
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
                  <button class="btn btn--ghost btn--sm" type="button" @click="qrToken = token">
                    {{ t('qr.button') }}
                  </button>
                </td>
                <td>{{ token.label || '—' }}</td>
                <td class="nowrap">{{ token.expires }}</td>
                <td class="hide-sm nowrap">
                  {{ token.lastAccess }}
                  <span v-if="token.lastOrigin" class="muted">({{ token.lastOrigin }})</span>
                </td>
                <td class="text-right">
                  <button
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="token.provisioned"
                    :title="token.provisioned ? t('userCard.tokens.provisionedTooltip') : t('userCard.tokens.delete')"
                    @click="askDeleteToken(token)"
                  >
                    {{ t('common.delete') }}
                  </button>
                </td>
              </tr>
              <tr v-if="tokens.length === 0">
                <td colspan="5" class="empty-state">{{ t('userCard.tokens.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Access rights -->
      <section class="section">
        <div class="section__head">
          <h3>{{ t('userCard.access.heading') }}</h3>
        </div>

        <div v-if="isAdmin" class="empty-state" style="padding: 12px 0">
          {{ t('userCard.access.adminNotice') }}
        </div>

        <template v-else>
          <div v-if="canManage" class="inline-form">
            <div class="field">
              <label for="access-topic">{{ t('userCard.access.topic') }}</label>
              <input
                id="access-topic"
                v-model="newTopic"
                type="text"
                autocomplete="off"
                :placeholder="t('userCard.access.topicPlaceholder')"
              />
            </div>
            <div class="field">
              <label for="access-permission">{{ t('userCard.access.permission') }}</label>
              <select id="access-permission" v-model="newPermission">
                <option v-for="option in PERMISSION_OPTIONS" :key="option.value" :value="option.value">
                  {{ permissionLabel(option.value) }}
                </option>
              </select>
            </div>
            <button
              class="btn"
              type="button"
              :disabled="accessBusy || !newTopic.trim()"
              @click="addAccess"
            >
              {{ accessBusy ? t('userCard.access.assigning') : t('userCard.access.assign') }}
            </button>
          </div>

          <div class="table-wrap">
            <table class="data data--compact">
              <thead>
                <tr>
                  <th>{{ t('userCard.access.topic') }}</th>
                  <th>{{ t('userCard.access.permission') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="grant in user.grants" :key="grant.topic">
                  <td>
                    <span class="token-value">{{ grant.topic }}</span>
                    <span v-if="grant.provisioned" class="badge badge--provisioned" style="margin-left: 8px">
                      {{ t('userCard.access.provisionedBadge') }}
                    </span>
                  </td>
                  <td>
                    <select
                      :value="grant.permission"
                      :disabled="grant.provisioned || !canManage"
                      @change="changePermission(grant, $event.target.value)"
                    >
                      <option v-for="option in PERMISSION_OPTIONS" :key="option.value" :value="option.value">
                        {{ permissionLabel(option.value) }}
                      </option>
                    </select>
                  </td>
                  <td class="text-right">
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      :disabled="grant.provisioned || !canManage"
                      @click="askDeleteAccess(grant)"
                    >
                      {{ t('common.delete') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="user.grants.length === 0">
                  <td colspan="3" class="empty-state">{{ t('userCard.access.empty') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="user.defaultAccess" class="form-hint" style="margin-top: 10px">
            {{ t('userCard.access.defaultAccess', { permission: permissionLabel(user.defaultAccess) }) }}
          </p>
        </template>
      </section>
    </template>

    <template #footer>
      <button class="btn btn--secondary" type="button" @click="emit('close')">
        {{ t('common.close') }}
      </button>
    </template>
  </BaseModal>

  <TokenQrModal v-if="qrToken" :value="qrToken.value" :label="qrToken.label" @close="qrToken = null" />

  <ConfirmDialog
    v-if="confirmState"
    :title="confirmState.title"
    :message="confirmState.message"
    :confirm-text="confirmState.confirmText"
    :busy="confirmBusy"
    @close="confirmState = null"
    @confirm="runConfirm"
  />
</template>
