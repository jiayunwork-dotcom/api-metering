import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '../api';

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));

  const isLoggedIn = computed(() => !!token.value);

  async function login(loginData) {
    const res = await authApi.login(loginData);
    if (res.success) {
      token.value = res.token;
      user.value = res.user;
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
    }
    return res;
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  async function fetchCurrentUser() {
    try {
      const res = await authApi.getCurrentUser();
      if (res.success) {
        user.value = res.user;
        localStorage.setItem('user', JSON.stringify(res.user));
      }
    } catch (e) {
      if (e.response?.status === 401) {
        logout();
      }
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    logout,
    fetchCurrentUser,
  };
});
