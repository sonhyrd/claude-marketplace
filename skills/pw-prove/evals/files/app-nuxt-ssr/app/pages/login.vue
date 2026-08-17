<script setup lang="ts">
const email = ref(''), password = ref('')
async function submit() {
  await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
  await navigateTo('/reports')
}
</script>

<template>
  <form @submit.prevent="submit">
    <input placeholder="you@example.com" v-model="email" />
    <input type="password" placeholder="Password" v-model="password" />
    <button type="submit">Sign in</button>
  </form>
</template>
