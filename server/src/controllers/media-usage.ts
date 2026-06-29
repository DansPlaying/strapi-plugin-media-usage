import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileUsages(ctx: any) {
    const fileId = parseInt(ctx.params.id, 10);
    if (Number.isNaN(fileId)) {
      return ctx.badRequest('Invalid file ID');
    }
    const data = await strapi
      .plugin('media-usage')
      .service('mediaUsage')
      .getFileUsages(fileId);
    ctx.body = { data };
  },
});
