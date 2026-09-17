<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
});

const emit = defineEmits(['close']);

function onKeydown(event) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <div class="modal" :class="`modal--${props.size}`" role="dialog" aria-modal="true">
      <header class="modal__header">
        <h2>{{ props.title }}</h2>
        <button class="icon-btn" type="button" :aria-label="t('common.close')" @click="emit('close')">
          ×
        </button>
      </header>
      <div class="modal__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="modal__footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
