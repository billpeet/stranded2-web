/**
 * includes/load_setup.bb: graphics mode, title, texture filters, camera,
 * listener, light, random seed. The file is top-level code only; it is
 * `include_load_setup()` here, called by main.ts where StrandedII.bb
 * includes it.
 */
import { Chr, MilliSecs, RuntimeError, SeedRnd } from '../blitz';
import { CameraRange, CreateCamera, CreateLight, CreateListener, CreatePivot, LightColor, TextureFilter } from '../bb3d';
import { BackBuffer, SetBuffer } from '../gfx2d';
import { HidePointer } from '../input';
import { live } from './_stubs';
import { con_add } from './con_add';
import { Cbmpf_red } from './consts';
import { CreateDir, FileType } from './files';
import { mb_setup } from './motionblur';
import { RT } from './rt';
import { createEnvironment, setGraphics } from './runtime';
import { G } from './state';
import { AppTitle, GfxMode3DExists, Windowed3D } from './sys';

/** Top-level code of load_setup.bb */
export function include_load_setup(): void {
	//Check and Set: Min. Resolution
	if (G.set_scrx < 800 || G.set_scry < 600) {
		//Resolution smaller than allowed?
		G.set_scrx = 800; //Set min. X Resolution
		G.set_scry = 600; //Set min. Y Resolution
	}

	//Check and Set: Color Depth
	switch (G.set_scrbit) {
		case 16:
		case 32:
			//16,32: Is valid - do nothing
			break;
		default:
			G.set_scrbit = 16; //Default: Not valid - set to 16
	}

	//Check Windowed
	if (G.set_scrwin > 1) {
		if (Windowed3D() === 0) {
			con_add('ERROR: Unable to run Stranded II in windowed mode', Cbmpf_red);
			G.set_scrwin = 0;
		}
	}

	//Check and Set: Graphics
	//Try the selected settings and 4 alternate settings until one works
	//Reply with an error message when no setting worked!
	if (GfxMode3DExists(G.set_scrx, G.set_scry, G.set_scrbit)) {
		//Selected Settings possible?
		setGraphics(G.set_scrx, G.set_scry, G.set_scrbit, G.set_scrwin); //Set!
	} else {
		if (GfxMode3DExists(800, 600, 16)) {
			//800x600x16?
			setGraphics(800, 600, 16, G.set_scrwin); //Set!
			G.set_scrx = 800;
			G.set_scry = 600;
			G.set_scrbit = 16;
		} else if (GfxMode3DExists(800, 600, 32)) {
			//800x600x32?
			setGraphics(800, 600, 32, G.set_scrwin); //Set!
			G.set_scrx = 800;
			G.set_scry = 600;
			G.set_scrbit = 32;
		} else if (GfxMode3DExists(1024, 768, 16)) {
			//1024x768x16?
			setGraphics(1024, 768, 16, G.set_scrwin); //Set!
			G.set_scrx = 1024;
			G.set_scry = 768;
			G.set_scrbit = 16;
		} else if (GfxMode3DExists(1024, 768, 32)) {
			//1024x768x32?
			setGraphics(1024, 768, 32, G.set_scrwin); //Set!
			G.set_scrx = 1024;
			G.set_scry = 768;
			G.set_scrbit = 32;
		} else {
			RuntimeError(
				'Unable to initiale Graphics' +
					Chr(13) +
					'Please check DirectX and GFX Drivers' +
					Chr(13) +
					Chr(13) +
					'Fehler beim Initialisieren der Grafik' +
					Chr(13) +
					'Bitte \xfcberpr\xfcfe DirectX und Grafiktreiber'
			);
		}
	}

	//Title + Pointer
	if (G.set_moddir === 'Stranded II') {
		AppTitle('Stranded II');
	} else {
		AppTitle(G.set_moddir + ' - Stranded II Mod');
	}
	HidePointer();

	//Filters
	TextureFilter('', 8); //Mipmapping in every Texture
	TextureFilter('_a', 2); //_a = Alpha
	TextureFilter('_m', 4); //_m = Masked
	TextureFilter('_c', 16 + 32); //_c = Clamp u and v
	TextureFilter('_u', 16); //_u = Clamp u
	TextureFilter('_v', 32); //_v = Clamp v
	TextureFilter('_h', 256); //_h = High Quality (Vram)
	TextureFilter('_hc', 512); //_hc = Highcolor
	TextureFilter('_sm', 64); //_sm = Spherical Reflection Map

	//Camera + Listener
	G.cam = CreateCamera();
	CameraRange(G.cam, 1, 3000);
	G.listener = CreateListener(G.cam, 0.02, 1, 1);
	RT.audio.load_setup_listener(); // the audio layer's side of CreateListener
	G.camxz = CreatePivot();

	//Light
	G.env_light = CreateLight(1);
	LightColor(G.env_light, 50, 50, 50);
	//LightColor env_light,255,50,50

	// port: the environment layer needs cam and env_light; it exists from here on (RT.core, RT.env)
	createEnvironment();

	//Random
	SeedRnd(MilliSecs());

	//Backbuffer
	SetBuffer(BackBuffer());

	//Motionblur
	mb_setup();

	//Check Directories
	if (FileType('saves') !== 2) CreateDir('saves');
	if (FileType('maps') !== 2) CreateDir('maps');
}
