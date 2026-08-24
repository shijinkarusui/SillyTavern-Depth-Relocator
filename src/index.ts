import '@/global.css';
import { initPanel } from '@/panel';
import { initDepthRelocator } from '@/depth-relocator';

$(() => {
  initDepthRelocator();
  initPanel();
});
