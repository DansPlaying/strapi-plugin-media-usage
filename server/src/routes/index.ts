export default {
  admin: {
    routes: [
      {
        method: 'GET' as const,
        path: '/files/:id/usages',
        handler: 'mediaUsage.getFileUsages',
        config: { policies: [] },
      },
    ],
  },
};
