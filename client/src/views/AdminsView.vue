<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import client from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useErrorText } from '../composables/useErrorText';
import CreateAdminModal from '../components/CreateAdminModal.vue';
import AdminPasswordModal from '../components/AdminPasswordModal.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const { t } = useI18n();
const errText = useErrorText();
const auth = useAuthStore();
const toast = useToastStore();

const admins = ref([]);
const loading = ref(true);
const loadError = ref(null);

const showCreate = ref(false);
const passwordAdmin = ref(null);
const adminToDelete = ref(null);
const deleteBusy = ref(false);

const errorText = computed(() => errText(loadError.value));

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const { data } = await client.get('/admins');
    admins.value = data.admins || [];
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function askDelete(admin) {
  adminToDelete.value = admin;
}

async function runDelete() {
  if (!adminToDelete.value) {
    return;
  }
  deleteBusy.value = true;
  const name = adminToDelete.value.username;
  try {
    await client.delete(`/admins/${adminToDelete.value.id}`);
    toast.success(t('admins.deleted', { name }));
    adminToDelete.value = null;
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
    <h1>{{ t('admins.title') }}</h1>
    <button class="btn" type="button" @click="showCreate = true">{{ t('admins.create') }}</button>
  </div>

  <p class="form-hint" style="margin-bottom: 16px">{{ t('admins.hint') }}</p>

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
            <th>{{ t('admins.columns.username') }}</th>
            <th class="hide-sm">{{ t('admins.columns.created') }}</th>
            <th class="hide-sm">{{ t('admins.columns.lastLogin') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="admin in admins" :key="admin.id">
            <td>
              <strong>{{ admin.username }}</strong>
              <span v-if="admin.isPrimary" class="badge badge--admin" style="margin-left: 8px">
                {{ t('admins.primaryBadge') }}
              </span>
              <span v-if="admin.username === auth.username" class="badge" style="margin-left: 8px">
                {{ t('admins.youBadge') }}
              </span>
            </td>
            <td class="hide-sm nowrap">{{ admin.createdAt }}</td>
            <td class="hide-sm nowrap">{{ admin.lastLoginAt || '—' }}</td>
            <td class="text-right nowrap">
              <button
                class="btn btn--secondary btn--sm"
                type="button"
                :disabled="admin.isPrimary"
                :title="admin.isPrimary ? t('admins.primaryTooltip') : t('admins.resetPassword')"
                @click="passwordAdmin = admin"
              >
                {{ t('admins.resetPassword') }}
              </button>
              <button
                class="btn btn--danger-outline btn--sm"
                type="button"
                :disabled="admin.isPrimary"
                :title="admin.isPrimary ? t('admins.primaryTooltip') : t('common.delete')"
                @click="askDelete(admin)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="admins.length === 0">
            <td colspan="4" class="empty-state">{{ t('admins.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <CreateAdminModal v-if="showCreate" @close="showCreate = false" @created="load" />

  <AdminPasswordModal
    v-if="passwordAdmin"
    :admin="passwordAdmin"
    @close="passwordAdmin = null"
    @changed="load"
  />

  <ConfirmDialog
    v-if="adminToDelete"
    :title="t('admins.deleteTitle')"
    :message="t('admins.deleteMessage', { name: adminToDelete.username })"
    :confirm-text="t('common.delete')"
    :busy="deleteBusy"
    @close="adminToDelete = null"
    @confirm="runDelete"
  />
</template>
