import { WebUI } from 'https://deno.land/x/webui@2.5.0/mod.ts';

const myWindow = new WebUI();

myWindow.bind('exit', () => {
	WebUI.exit();
});

myWindow.show('./public/index.html');

// Wait until all windows get closed
await WebUI.wait();