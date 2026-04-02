import { FacebookLiveListener } from './facebookListener.js';
import { Yad2LiveListener } from './yad2Listener.js';

class ListenerManager {
  constructor() {
    this.facebook = new FacebookLiveListener();
    this.yad2 = new Yad2LiveListener();
    this._shutdownRegistered = false;
  }

  async startAll() {
    console.log('[ListenerManager] Starting all listeners...');
    this.registerShutdown();

    // Start both in parallel
    await Promise.allSettled([
      this.facebook.start(),
      this.yad2.start(),
    ]);

    console.log('[ListenerManager] All listeners started');
  }

  async stopAll() {
    console.log('[ListenerManager] Stopping all listeners...');
    await Promise.allSettled([
      this.facebook.stop(),
      this.yad2.stop(),
    ]);
    console.log('[ListenerManager] All listeners stopped');
  }

  async startFacebook() {
    await this.facebook.start();
  }

  async startYad2() {
    await this.yad2.start();
  }

  async stopFacebook() {
    await this.facebook.stop();
  }

  async stopYad2() {
    await this.yad2.stop();
  }

  getStatus() {
    return {
      facebook: this.facebook.getStatus(),
      yad2: this.yad2.getStatus(),
    };
  }

  registerShutdown() {
    if (this._shutdownRegistered) return;
    this._shutdownRegistered = true;

    const shutdown = async () => {
      console.log('[ListenerManager] Shutting down gracefully...');
      await this.stopAll();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

// Singleton
export const listenerManager = new ListenerManager();
