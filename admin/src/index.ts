import { Initializer } from './components/Initializer';

const PLUGIN_ID = 'media-usage';

export default {
  register(app: any) {
    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },
  async registerTrads() {
    return [];
  },
};
