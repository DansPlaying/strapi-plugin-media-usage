import routes from './routes';
import controllers from './controllers';
import services from './services';

const plugin: Record<string, any> = { routes, controllers, services };

export default plugin;
