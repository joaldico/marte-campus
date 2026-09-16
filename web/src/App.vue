<script setup lang="ts">
import { NConfigProvider, NLayout, NLayoutContent, NLayoutHeader } from 'naive-ui'
</script>

<template>
  <n-config-provider>
    <n-layout>
      <n-layout-header bordered class="header">
        <img src="/logo.png" alt="Campus Marte" class="logo" />
      </n-layout-header>
      <n-layout-content class="content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  padding: 12px 24px;
}

.logo {
  height: 48px;
  width: auto;
}

.content {
  padding: 24px;
}
</style>
