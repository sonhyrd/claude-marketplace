<script setup lang="ts">
const status = ref<string>('')
const rows = await useFetch('/api/reports')
async function rename(id: string, title: string) {
  await $fetch('/api/reports/rename', { method: 'POST', body: { id, title } })
  status.value = 'Saved'
}
</script>

<template>
  <main>
    <h1>Reports</h1>
    <input aria-label="Report title" v-model="title" />
    <button @click="rename(current.id, title)">Save report</button>
    <p role="status">{{ status }}</p>
    <ul data-testid="reports-list">
      <li v-for="r in rows.data.value" :key="r.id">{{ r.title }}</li>
    </ul>
  </main>
</template>
