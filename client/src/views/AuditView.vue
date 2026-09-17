<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import client from '../api/client';
import { useErrorText } from '../composables/useErrorText';
import { ACTION_KEYS } from '../constants';

const { t, te, locale } = useI18n();
const errText = useErrorText();

const items = ref([]);
const loading = ref(true);
const loadError = ref(null);

const filters = reactive({
  from: '',
  to: '',
  admin: '',
  action: '',
  targetUser: '',
});

const page = ref(1);
const pageSize = ref(25);
const total = ref(0);
const totalPages = ref(1);

const filterOptions = ref({ actions: [], admins: [] });

const errorText = computed(() => errText(loadError.value));

const actionOptions = computed(() => {
  const set = new Set([...ACTION_KEYS, ...filterOptions.value.actions]);
  return Array.from(set).sort();
});

function actionLabel(action) {
  return te(`actions.${action}`) ? t(`actions.${action}`) : action;
}

async function loadFilterOptions() {
  try {
    const { data } = await client.get('/audit/filters');
    filterOptions.value = { actions: data.actions || [], admins: data.admins || [] };
  } catch {
    // filters are non-critical
  }
}

function toUtcSql(localValue) {
  if (!localValue) {
    return '';
  }
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`
  );
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filters.from) {
      params.from = toUtcSql(filters.from);
    }
    if (filters.to) {
      params.to = toUtcSql(filters.to);
    }
    if (filters.admin) {
      params.admin = filters.admin;
    }
    if (filters.action) {
      params.action = filters.action;
    }
    if (filters.targetUser) {
      params.targetUser = filters.targetUser.trim();
    }

    const { data } = await client.get('/audit', { params });
    items.value = data.items;
    total.value = data.total;
    totalPages.value = data.totalPages;
  } catch (err) {
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadFilterOptions();
  load();
});

function applyFilters() {
  page.value = 1;
  load();
}

function resetFilters() {
  Object.keys(filters).forEach((key) => {
    filters[key] = '';
  });
  page.value = 1;
  load();
}

function goToPage(target) {
  if (target < 1 || target > totalPages.value || target === page.value) {
    return;
  }
  page.value = target;
  load();
}

function parseUtc(value) {
  if (!value) {
    return null;
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseUtc(value);
  if (!date) {
    return value;
  }
  return date.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US');
}

function formatDetails(details) {
  if (!details) {
    return '—';
  }
  return JSON.stringify(details);
}
</script>

<template>
  <div class="page-head">
    <h1>{{ t('audit.title') }}</h1>
  </div>

  <div class="card" style="padding: 16px; margin-bottom: 16px">
    <div class="toolbar" style="margin-bottom: 0">
      <div class="field" style="margin-bottom: 0">
        <label for="filter-from">{{ t('audit.from') }}</label>
        <input id="filter-from" v-model="filters.from" type="datetime-local" />
      </div>
      <div class="field" style="margin-bottom: 0">
        <label for="filter-to">{{ t('audit.to') }}</label>
        <input id="filter-to" v-model="filters.to" type="datetime-local" />
      </div>
      <div class="field" style="margin-bottom: 0">
        <label for="filter-admin">{{ t('audit.admin') }}</label>
        <input
          id="filter-admin"
          v-model="filters.admin"
          type="text"
          list="admin-options"
          :placeholder="t('common.any')"
        />
        <datalist id="admin-options">
          <option v-for="admin in filterOptions.admins" :key="admin" :value="admin" />
        </datalist>
      </div>
      <div class="field" style="margin-bottom: 0">
        <label for="filter-action">{{ t('audit.action') }}</label>
        <select id="filter-action" v-model="filters.action">
          <option value="">{{ t('audit.allActions') }}</option>
          <option v-for="action in actionOptions" :key="action" :value="action">
            {{ actionLabel(action) }}
          </option>
        </select>
      </div>
      <div class="field" style="margin-bottom: 0">
        <label for="filter-target">{{ t('audit.targetUser') }}</label>
        <input
          id="filter-target"
          v-model="filters.targetUser"
          type="text"
          :placeholder="t('common.any')"
        />
      </div>
      <button class="btn" type="button" @click="applyFilters">{{ t('audit.apply') }}</button>
      <button class="btn btn--secondary" type="button" @click="resetFilters">
        {{ t('audit.reset') }}
      </button>
    </div>
  </div>

  <div class="card">
    <div v-if="loading" class="empty-state">{{ t('common.loading') }}</div>
    <div v-else-if="errorText" class="empty-state">{{ errorText }}</div>
    <template v-else>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th class="nowrap">{{ t('audit.columns.date') }}</th>
              <th>{{ t('audit.columns.admin') }}</th>
              <th>{{ t('audit.columns.action') }}</th>
              <th class="hide-sm">{{ t('audit.columns.targetUser') }}</th>
              <th class="hide-sm">{{ t('audit.columns.details') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td class="nowrap">{{ formatDate(item.createdAt) }}</td>
              <td>{{ item.adminUsername }}</td>
              <td>{{ actionLabel(item.action) }}</td>
              <td class="hide-sm">{{ item.targetUser || '—' }}</td>
              <td class="hide-sm">
                <code class="token-value muted">{{ formatDetails(item.details) }}</code>
              </td>
            </tr>
            <tr v-if="items.length === 0">
              <td colspan="5" class="empty-state">{{ t('audit.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span>{{ t('audit.total', { count: total }) }}</span>
        <button
          class="btn btn--secondary btn--sm"
          type="button"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        >
          {{ t('audit.back') }}
        </button>
        <span>{{ t('audit.page', { page, pages: totalPages }) }}</span>
        <button
          class="btn btn--secondary btn--sm"
          type="button"
          :disabled="page >= totalPages"
          @click="goToPage(page + 1)"
        >
          {{ t('audit.next') }}
        </button>
      </div>
    </template>
  </div>
</template>
