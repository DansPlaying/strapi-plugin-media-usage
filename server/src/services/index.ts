import mediaUsage from './media-usage';

const services: Record<string, (ctx: any) => Record<string, any>> = {
  mediaUsage,
} as any;

export default services;
