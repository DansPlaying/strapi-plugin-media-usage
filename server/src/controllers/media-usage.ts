import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileUsages(ctx: any) {
    const fileId = parseInt(ctx.params.id, 10);
    if (Number.isNaN(fileId)) {
      return ctx.badRequest('Invalid file ID');
    }
    let data: any[] = [];
    try {
      data = await strapi
        .plugin('media-usage')
        .service('mediaUsage')
        .getFileUsages(fileId);
    } catch {
      // swallow errors — return empty list
    }
    ctx.body = { data };
  },
});
