<script setup lang="ts">
defineProps<{
  src: string
  alt?: string
  caption?: string
  maxWidth?: string
}>()
</script>

<template>
  <figure class="doc-image" :style="{ maxWidth: maxWidth || undefined }">
    <img :src="src" :alt="alt || caption || ''" loading="lazy" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
