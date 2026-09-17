import Phaser from 'phaser';
import { TrafficScene } from './rendering/TrafficScene';
import { Controller } from './ui/controller';
import { mountUI } from './ui/app';
import './style.css';

const controller = new Controller();
const bindView = mountUI(controller);
const scene = new TrafficScene(controller);
bindView(scene);
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'map',
  backgroundColor: '#e4ece8',
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [scene],
  input: { activePointers: 3 },
  audio: { noAudio: true }
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      controller.notify('Offline support is unavailable in this browser. You can keep playing online.');
    });
  });
}
