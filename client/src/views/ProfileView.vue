<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="page-head">
    <h1>{{ t('comingSoon.title') }}</h1>
  </div>

  <div class="card">
    <div class="empty-state">
      <p>{{ t('comingSoon.message') }}</p>
    </div>
  </div>
</template>
