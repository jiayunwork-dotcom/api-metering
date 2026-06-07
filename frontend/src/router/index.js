import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
        meta: { hidden: true },
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '运营概览', icon: 'DataLine' },
      },
      {
        path: 'tenants',
        name: 'Tenants',
        component: () => import('../views/Tenants.vue'),
        meta: { title: '租户管理', icon: 'User' },
      },
      {
        path: 'tenants/:id',
        name: 'TenantDetail',
        component: () => import('../views/TenantDetail.vue'),
        meta: { title: '租户详情', hidden: true },
      },
      {
        path: 'rules',
        name: 'Rules',
        component: () => import('../views/Rules.vue'),
        meta: { title: '计费规则', icon: 'Setting' },
      },
      {
        path: 'bills',
        name: 'Bills',
        component: () => import('../views/Bills.vue'),
        meta: { title: '账单管理', icon: 'Document' },
      },
      {
        path: 'bills/:id',
        name: 'BillDetail',
        component: () => import('../views/BillDetail.vue'),
        meta: { title: '账单详情', hidden: true },
      },
      {
        path: 'invoices',
        name: 'Invoices',
        component: () => import('../views/Invoices.vue'),
        meta: { title: '发票管理', icon: 'Tickets' },
      },
      {
        path: 'usage',
        name: 'Usage',
        component: () => import('../views/Usage.vue'),
        meta: { title: '用量查询', icon: 'DataAnalysis' },
      },
      {
        path: 'dead-letters',
        name: 'DeadLetters',
        component: () => import('../views/DeadLetters.vue'),
        meta: { title: '死信队列', icon: 'Warning' },
      },
      {
        path: 'reconciliation',
        name: 'Reconciliation',
        component: () => import('../views/Reconciliation.vue'),
        meta: { title: '数据对账', icon: 'Check' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  
  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next('/login');
  } else if (to.path === '/login' && userStore.isLoggedIn) {
    next('/');
  } else {
    next();
  }
});

export default router;
