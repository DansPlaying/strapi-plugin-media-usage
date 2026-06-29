import mediaUsage from './media-usage';

const controllers: Record<string, (ctx: any) => Record<string, any>> = {
  mediaUsage,
} as any;

export default controllers;
