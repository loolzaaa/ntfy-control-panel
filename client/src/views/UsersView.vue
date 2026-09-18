<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import client from '../api/client';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';
import CreateUserModal from '../components/CreateUserModal.vue';
import UserCardModal from '../components/UserCardModal.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const { t } = useI18n();
const errText = useErrorText();
const toast = useToastStore();

const users = ref([]);
const loading = ref(true);
const loadError = ref(null);
const search = ref('');

const showCreate = ref(false);
const selectedUsername = ref(null);
const userToDelete = ref(null);
const deleteBusy = ref(false);

const errorText = computed(() => errText(loadError.value));

const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return users.value;
  }
  return users.value.filter((user) => user.name.toLowerCase().includes(query));
});

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const { data } = await client.get('/users');
    users.value = data.users;
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openUser(user) {
  selectedUsername.value = user.name;
}

function askDelete(user) {
  userToDelete.value = user;
}

async function runDelete() {
  if (!userToDelete.value) {
    return;
  }
  deleteBusy.value = true;
  const name = userToDelete.value.name;
  try {
    await client.delete(`/users/${encodeURIComponent(name)}`);
    toast.success(t('users.deleted', { name }));
    userToDelete.value = null;
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
    <h1>{{ t('users.title') }}</h1>
    <button class="btn" type="button" @click="showCreate = true">{{ t('users.create') }}</button>
  </div>

  <div class="toolbar">
    <input
      v-model="search"
      type="search"
      :placeholder="t('users.searchPlaceholder')"
      style="max-width: 320px"
    />
    <span class="muted">{{ t('users.found', { count: filteredUsers.length }) }}</span>
  </div>

  <div class="card">
    <div v-if="loading" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="errorText" class="empty-state">{{ errorText }}</div>
    <div v-else class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>{{ t('users.columns.username') }}</th>
            <th>{{ t('users.columns.role') }}</th>
            <th class="hide-sm">{{ t('users.columns.tier') }}</th>
            <th class="hide-sm">{{ t('users.columns.source') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.name" class="clickable" @click="openUser(user)">
            <td>
              <strong>{{ user.name }}</strong>
              <span v-if="user.anonymous" class="badge badge--anon" style="margin-left: 8px">
                {{ t('users.anonymous') }}
              </span>
            </td>
            <td>
              <span class="badge" :class="user.admin ? 'badge--admin' : 'badge--user'">
                {{ t(`roles.${user.role}`) }}
              </span>
            </td>
            <td class="hide-sm">{{ user.tier || '—' }}</td>
            <td class="hide-sm">
              <span v-if="user.provisioned" class="badge badge--provisioned">
                {{ t('users.sourceConfig') }}
              </span>
              <span v-else class="muted">{{ t('users.sourceManual') }}</span>
            </td>
            <td class="text-right nowrap" @click.stop>
              <button
                class="btn btn--danger-outline btn--sm"
                type="button"
                :disabled="user.anonymous || user.provisioned"
                :title="user.provisioned ? t('users.provisionedTooltip') : t('users.deleteTooltip')"
                @click="askDelete(user)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="filteredUsers.length === 0">
            <td colspan="5" class="empty-state">
              {{ search ? t('users.emptySearch') : t('users.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <CreateUserModal v-if="showCreate" @close="showCreate = false" @created="load" />

  <UserCardModal
    v-if="selectedUsername"
    :username="selectedUsername"
    @close="selectedUsername = null"
    @changed="load"
  />

  <ConfirmDialog
    v-if="userToDelete"
    :title="t('users.deleteTitle')"
    :message="t('users.deleteMessage', { name: userToDelete.name })"
    :confirm-text="t('common.delete')"
    :busy="deleteBusy"
    @close="userToDelete = null"
    @confirm="runDelete"
  />
</template>
