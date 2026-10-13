/**
 * includes/game_input_vehicles.bb: the controls while the player rides or
 * drives a unit (g_drive): animals, vehicles, watercraft, aircraft.
 */
import { Animate, EntityX, EntityY, EntityZ, HideEntity, MoveEntity, PositionEntity, ShowEntity, TranslateEntity, TurnEntity } from '../bb3d';
import { Float, Int, Rnd, f32, fabs } from '../blitz';
import { Ckey_backward, Ckey_forward, Ckey_left, Ckey_right, Cp_rwave, snd_move } from './consts';
import { Dunit_ani_move, Dunit_behaviour, Dunit_colyr, Dunit_loopmoveani, Dunit_sfx, Dunit_speed, Dunit_tspeed, Dunit_v } from './defs_arrays';
import { e_tery } from './e_environment';
import { split } from './functions';
import { kill_unit } from './handle_units';
import { p_add } from './particles';
import { play_soundset } from './ressources';
import { RT } from './rt';
import { G } from './state';
import { After, First, Tunit } from './types';
import { up_controlled } from './unitpath';

//############################################ GAME INPUT FOR VEHICLES

//Vehicle Input
/** Function game_input_vehicles() */
export function game_input_vehicles(): void {
	//Local tx#,ty#,tz#   (never used)
	let Tunit_: Tunit | null = null;

	//Find Vehicle Unit
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === G.g_drive) {
			//Vehicle is follows a unit path?
			if (up_controlled(Tunit_.id) === 0) {
				switch (Dunit_behaviour(Tunit_.typ)) {
					//Vehicle
					case 500:
						game_input_vehicle(Tunit_);
						if (EntityY(Tunit_.mh, 1) < -G.v_maxdepth) {
							G.TCunit = Tunit_;
							kill_unit();
						}
						break;

					//Watercraft
					case 501:
						game_input_watercraft(Tunit_);
						if (EntityY(Tunit_.mh, 1) < -G.v_maxdepth) {
							G.TCunit = Tunit_;
							kill_unit();
						}
						break;

					//Aircraft
					case 502:
						game_input_aircraft(Tunit_);
						//If EntityY(Tunit\mh,1)<-v_maxdepth Then TCunit=Tunit:kill_unit()
						break;

					//Default Control (Animal)
					default:
						game_input_animal(Tunit_);
						if (EntityY(Tunit_.mh, 1) < -G.v_maxdepth) {
							G.TCunit = Tunit_;
							kill_unit();
						}
				}
			} else {
				//Vehicle is not controllable because it follows a unit path!
			}

			//Draw Vehicle Direction
			if (G.m_menu === 0) {
				if (G.set_drawinterface === 1) {
					//Local yawv#=DeltaYaw(Tunit\mh,cam)
					//DrawImage gfx_arrows,(set_scrx/2)+Sin(yawv#)*40.0,(set_scry/2)-Cos(yawv#)*40.0,0
				}
			}

			break;
		}
	}
}

//############################################ Animal
/** Function game_input_animal(Tunit.Tunit) */
export function game_input_animal(Tunit_: Tunit | null): void {
	let anim = 0;
	let tspeed = 0;
	let perc = 0;
	let moved = 0;
	anim = 0;

	//Rotate Left/Right
	tspeed = G.v_turnspeed;
	if (G.v_steering === 1) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
	} else if (G.v_steering === 2) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
		tspeed = f32(tspeed + f32(G.v_turnspeed / 2));
		if (tspeed > G.v_turnspeed) tspeed = G.v_turnspeed;
	}
	// quirk: v_steerpos is an Int global: every Float step is rounded to a whole number
	if (G.in_keydown[Ckey_left]) {
		G.v_steerpos = Int(f32(G.v_steerpos + f32(7.0 * G.f)));
		if (G.v_steerpos > 100) G.v_steerpos = 100;
	} else if (G.in_keydown[Ckey_right]) {
		G.v_steerpos = Int(f32(G.v_steerpos - f32(7.0 * G.f)));
		if (G.v_steerpos < -100) G.v_steerpos = -100;
	} else {
		if (G.v_steerpos > 0) {
			G.v_steerpos = Int(f32(G.v_steerpos - f32(7.0 * G.f)));
		} else if (G.v_steerpos < 0) {
			G.v_steerpos = Int(f32(G.v_steerpos + f32(7.0 * G.f)));
		}
	}
	if (G.v_steerpos !== 0) {
		TurnEntity(Tunit_!.h, 0, f32(f32(tspeed * G.f) * Float(f32(G.v_steerpos / 100))), 0);
	}

	//Move
	moved = 0;
	if (G.in_keydown[Ckey_forward]) {
		G.v_speed = f32(G.v_speed + G.v_acceleration);
		if (G.v_speed > G.v_topspeed) G.v_speed = G.v_topspeed;
		moved = 1;
	} else if (G.in_keydown[Ckey_backward]) {
		G.v_speed = f32(G.v_speed - G.v_acceleration);
		if (G.v_speed < -G.v_topspeed) G.v_speed = -G.v_topspeed;
		moved = 1;
	}

	//Perform
	if (moved === 0) {
		if (G.v_speed > 0) {
			G.v_speed = f32(G.v_speed - G.v_friction);
			if (G.v_speed < 0) G.v_speed = 0;
		} else if (G.v_speed < 0) {
			G.v_speed = f32(G.v_speed + G.v_friction);
			if (G.v_speed > 0) G.v_speed = 0;
		}
	}
	if (G.v_speed !== 0) {
		MoveEntity(Tunit_!.h, 0, 0, f32(G.v_speed * G.f));
		anim = 1;
		//Sound
		if (Tunit_!.chan !== 0) {
			if (RT.audio.bb.ChannelPlaying(Tunit_!.chan) === 0) {
				Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			} else {
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			}
		} else {
			Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
			RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
		}
	}

	//Animate
	if (anim === 0) {
		Animate(Tunit_!.mh, 0);
		Tunit_!.ani = 0;
	} else {
		if (Tunit_!.ani !== Dunit_ani_move(Tunit_!.typ, 1)) {
			Tunit_!.ani = Int(Dunit_ani_move(Tunit_!.typ, 1));
			if (Dunit_loopmoveani(Tunit_!.typ) === 1) {
				Animate(Tunit_!.mh, 1, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			} else {
				Animate(Tunit_!.mh, 2, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			}
		}
	}
}

//############################################  Vehicle
/** Function game_input_vehicle(Tunit.Tunit) */
export function game_input_vehicle(Tunit_: Tunit | null): void {
	let anim = 0;
	let tspeed = 0;
	let perc = 0;
	let moved = 0;
	if (Tunit_!.vh !== null) HideEntity(Tunit_!.vh);
	anim = 0;

	//Rotate Left/Right
	tspeed = G.v_turnspeed;
	if (G.v_steering === 1) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
	} else if (G.v_steering === 2) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
		tspeed = f32(tspeed + f32(G.v_turnspeed / 2));
		if (tspeed > G.v_turnspeed) tspeed = G.v_turnspeed;
	}

	// quirk: v_steerpos is an Int global: every Float step is rounded to a whole number
	if (G.in_keydown[Ckey_left]) {
		G.v_steerpos = Int(f32(G.v_steerpos + f32(6.0 * G.f)));
		if (G.v_steerpos > 100) G.v_steerpos = 100;
	} else if (G.in_keydown[Ckey_right]) {
		G.v_steerpos = Int(f32(G.v_steerpos - f32(6.0 * G.f)));
		if (G.v_steerpos < -100) G.v_steerpos = -100;
	} else {
		if (G.v_steerpos > 0) {
			G.v_steerpos = Int(f32(G.v_steerpos - f32(5.5 * G.f)));
		} else if (G.v_steerpos < 0) {
			G.v_steerpos = Int(f32(G.v_steerpos + f32(5.5 * G.f)));
		}
	}
	if (G.v_steerpos !== 0) {
		TurnEntity(Tunit_!.h, 0, f32(f32(tspeed * G.f) * Float(f32(G.v_steerpos / 100))), 0);
	}

	//Move
	moved = 0;
	if (G.in_keydown[Ckey_forward]) {
		G.v_speed = f32(G.v_speed + G.v_acceleration);
		if (G.v_speed > G.v_topspeed) G.v_speed = G.v_topspeed;
		moved = 1;
	} else if (G.in_keydown[Ckey_backward]) {
		G.v_speed = f32(G.v_speed - G.v_acceleration);
		if (G.v_speed < -G.v_topspeed) G.v_speed = -G.v_topspeed;
		moved = 1;
	}

	//Perform
	if (moved === 0) {
		if (G.v_speed > 0) {
			G.v_speed = f32(G.v_speed - G.v_friction);
			if (G.v_speed < 0) G.v_speed = 0;
		} else if (G.v_speed < 0) {
			G.v_speed = f32(G.v_speed + G.v_friction);
			if (G.v_speed > 0) G.v_speed = 0;
		}
	}
	if (G.v_speed !== 0) {
		MoveEntity(Tunit_!.h, 0, 0, f32(G.v_speed * G.f));
		anim = 1;
		//Sound
		if (Tunit_!.chan !== 0) {
			if (RT.audio.bb.ChannelPlaying(Tunit_!.chan) === 0) {
				Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			} else {
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			}
		} else {
			Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
			RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
		}
	}

	//Animate
	if (anim === 0) {
		Animate(Tunit_!.mh, 0);
		Tunit_!.ani = 0;
	} else {
		if (Tunit_!.ani !== Dunit_ani_move(Tunit_!.typ, 1)) {
			Tunit_!.ani = Int(Dunit_ani_move(Tunit_!.typ, 1));
			if (Dunit_loopmoveani(Tunit_!.typ) === 1) {
				Animate(Tunit_!.mh, 1, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			} else {
				Animate(Tunit_!.mh, 2, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			}
		}
	}

	if (Tunit_!.vh !== null) ShowEntity(Tunit_!.vh);
}

//############################################ Watercraft
/** Function game_input_watercraft(Tunit.Tunit) */
export function game_input_watercraft(Tunit_: Tunit | null): void {
	let anim = 0;
	let tspeed = 0;
	let perc = 0;
	let moved = 0;
	if (Tunit_!.vh !== null) HideEntity(Tunit_!.vh);
	anim = 0;

	//Rotate Left/Right
	tspeed = G.v_turnspeed;
	if (G.v_steering === 1) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
	} else if (G.v_steering === 2) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
		tspeed = f32(tspeed + f32(G.v_turnspeed / 2));
		if (tspeed > G.v_turnspeed) tspeed = G.v_turnspeed;
	}

	// quirk: v_steerpos is an Int global: every Float step is rounded to a whole number
	if (G.in_keydown[Ckey_left]) {
		G.v_steerpos = Int(f32(G.v_steerpos + f32(2.1 * G.f)));
		if (G.v_steerpos > 100) G.v_steerpos = 100;
	} else if (G.in_keydown[Ckey_right]) {
		G.v_steerpos = Int(f32(G.v_steerpos - f32(2.1 * G.f)));
		if (G.v_steerpos < -100) G.v_steerpos = -100;
	} else {
		if (G.v_steerpos > 0) {
			G.v_steerpos = Int(f32(G.v_steerpos - f32(2.0 * G.f)));
		} else if (G.v_steerpos < 0) {
			G.v_steerpos = Int(f32(G.v_steerpos + f32(2.0 * G.f)));
		}
	}
	if (G.v_steerpos !== 0) {
		TurnEntity(Tunit_!.h, 0, f32(f32(tspeed * G.f) * Float(f32(G.v_steerpos / 100))), 0);
	}

	//Move
	moved = 0;
	if (G.in_keydown[Ckey_forward]) {
		G.v_speed = f32(G.v_speed + G.v_acceleration);
		if (G.v_speed > G.v_topspeed) G.v_speed = G.v_topspeed;
		moved = 1;
	} else if (G.in_keydown[Ckey_backward]) {
		G.v_speed = f32(G.v_speed - G.v_acceleration);
		if (G.v_speed < -G.v_topspeed) G.v_speed = -G.v_topspeed;
		moved = 1;
	}

	//Perform
	if (moved === 0) {
		if (G.v_speed > 0) {
			G.v_speed = f32(G.v_speed - G.v_friction);
			if (G.v_speed < 0) G.v_speed = 0;
		} else if (G.v_speed < 0) {
			G.v_speed = f32(G.v_speed + G.v_friction);
			if (G.v_speed > 0) G.v_speed = 0;
		}
	}
	if (G.v_speed !== 0) {
		MoveEntity(Tunit_!.h, 0, 0, f32(G.v_speed * G.f));
		anim = 1;
		//Landcheck
		if (e_tery(EntityX(Tunit_!.h), EntityZ(Tunit_!.h)) > -1) {
			MoveEntity(Tunit_!.h, 0, 0, f32(-G.v_speed * G.f));
			G.v_speed = 0;
		} else {
			//Waves
			if (G.in_gt100go) {
				p_add(EntityX(Tunit_!.h), 1, EntityZ(Tunit_!.h), Cp_rwave, Rnd(10, 20), Rnd(0.6, 0.9));
			}
		}
		//Sound
		// quirk: after the landcheck stopped the craft the volume is set to 0 (v_speed is 0)
		if (Tunit_!.chan !== 0) {
			if (RT.audio.bb.ChannelPlaying(Tunit_!.chan) === 0) {
				Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			} else {
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			}
		} else {
			Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
			RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
		}
	}

	//Animate
	if (anim === 0) {
		Animate(Tunit_!.mh, 0);
		Tunit_!.ani = 0;
	} else {
		if (Tunit_!.ani !== Dunit_ani_move(Tunit_!.typ, 1)) {
			Tunit_!.ani = Int(Dunit_ani_move(Tunit_!.typ, 1));
			if (Dunit_loopmoveani(Tunit_!.typ) === 1) {
				Animate(Tunit_!.mh, 1, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			} else {
				Animate(Tunit_!.mh, 2, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			}
		}
	}

	if (Tunit_!.vh !== null) ShowEntity(Tunit_!.vh);
}

//############################################ Aircraft
/** Function game_input_aircraft(Tunit.Tunit) */
export function game_input_aircraft(Tunit_: Tunit | null): void {
	let anim = 0;
	let tspeed = 0;
	let perc = 0;
	let moved = 0;
	let tery = 0;
	if (Tunit_!.vh !== null) HideEntity(Tunit_!.vh);
	anim = 0;

	//Rotate Left/Right
	tspeed = G.v_turnspeed;
	if (G.v_steering === 1) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
	} else if (G.v_steering === 2) {
		perc = f32(fabs(G.v_speed) / G.v_topspeed);
		tspeed = f32(tspeed * perc);
		tspeed = f32(tspeed + f32(G.v_turnspeed / 2));
		if (tspeed > G.v_turnspeed) tspeed = G.v_turnspeed;
	}

	// quirk: v_steerpos is an Int global: every Float step is rounded to a whole number
	if (G.in_keydown[Ckey_left]) {
		G.v_steerpos = Int(f32(G.v_steerpos + f32(6.0 * G.f)));
		if (G.v_steerpos > 100) G.v_steerpos = 100;
	} else if (G.in_keydown[Ckey_right]) {
		G.v_steerpos = Int(f32(G.v_steerpos - f32(6.0 * G.f)));
		if (G.v_steerpos < -100) G.v_steerpos = -100;
	} else {
		if (G.v_steerpos > 0) {
			G.v_steerpos = Int(f32(G.v_steerpos - f32(5.5 * G.f)));
		} else if (G.v_steerpos < 0) {
			G.v_steerpos = Int(f32(G.v_steerpos + f32(5.5 * G.f)));
		}
	}
	if (G.v_steerpos !== 0) {
		TurnEntity(Tunit_!.h, 0, f32(f32(tspeed * G.f) * Float(f32(G.v_steerpos / 100))), 0);
	}

	//Move
	moved = 0;
	if (G.in_keydown[Ckey_forward]) {
		G.v_speed = f32(G.v_speed + G.v_acceleration);
		if (G.v_speed > G.v_topspeed) G.v_speed = G.v_topspeed;
		moved = 1;
	} else if (G.in_keydown[Ckey_backward]) {
		G.v_speed = f32(G.v_speed - G.v_acceleration);
		if (G.v_speed < -G.v_topspeed) G.v_speed = -G.v_topspeed;
		moved = 1;
	}

	//Perform
	if (moved === 0) {
		if (G.v_speed > 0) {
			G.v_speed = f32(G.v_speed - G.v_friction);
			if (G.v_speed < 0) G.v_speed = 0;
		} else if (G.v_speed < 0) {
			G.v_speed = f32(G.v_speed + G.v_friction);
			if (G.v_speed > 0) G.v_speed = 0;
		}
	}
	if (G.v_speed !== 0) {
		MoveEntity(Tunit_!.h, 0, 0, f32(G.v_speed * G.f));
		anim = 1;
		//Sound
		if (Tunit_!.chan !== 0) {
			if (RT.audio.bb.ChannelPlaying(Tunit_!.chan) === 0) {
				Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			} else {
				RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
			}
		} else {
			Tunit_!.chan = play_soundset(Dunit_sfx(Tunit_!.typ), snd_move, Tunit_!.h);
			RT.audio.bb.ChannelVolume(Tunit_!.chan, f32(Float(f32(Float(fabs(G.v_speed)) / G.v_topspeed)) * G.set_fxvolume));
		}
	}

	//Animate
	if (anim === 0) {
		Animate(Tunit_!.mh, 0);
		Tunit_!.ani = 0;
	} else {
		if (Tunit_!.ani !== Dunit_ani_move(Tunit_!.typ, 1)) {
			Tunit_!.ani = Int(Dunit_ani_move(Tunit_!.typ, 1));
			if (Dunit_loopmoveani(Tunit_!.typ) === 1) {
				Animate(Tunit_!.mh, 1, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			} else {
				Animate(Tunit_!.mh, 2, Dunit_ani_move(Tunit_!.typ, 0), Int(Dunit_ani_move(Tunit_!.typ, 1)), 1);
			}
		}
	}

	//Rise/Fall
	perc = f32(G.v_speed / G.v_topspeed);
	//Rise
	if (perc > 0.5) {
		//perc#=perc#*2.
		//perc#=1.-perc#

		TranslateEntity(Tunit_!.h, 0, f32(f32(3 * G.f) * perc), 0);
		//Fall
	} else {
		perc = f32(1 - perc);
		TranslateEntity(Tunit_!.h, 0, f32(f32(-10 * G.f) * perc), 0);

		//Keep over Terrain
		tery = e_tery(EntityX(Tunit_!.h), EntityZ(Tunit_!.h));
		if (EntityY(Tunit_!.h) < f32(tery + Dunit_colyr(Tunit_!.typ))) {
			PositionEntity(Tunit_!.h, EntityX(Tunit_!.h), f32(tery + Dunit_colyr(Tunit_!.typ)), EntityZ(Tunit_!.h));
		}
	}

	//Max Height
	if (EntityY(Tunit_!.h) > 900) PositionEntity(Tunit_!.h, EntityX(Tunit_!.h), 900, EntityZ(Tunit_!.h));

	if (Tunit_!.vh !== null) ShowEntity(Tunit_!.vh);
}

//############################################ Load Vehicle Data
/** Function game_input_vehicledata(typ) */
export function game_input_vehicledata(typ: number): void {
	//Start at 0 Speed!
	G.v_speed = 0;
	G.v_steerpos = 0;
	//Stuff
	G.v_topspeed = Dunit_speed(typ);
	G.v_turnspeed = Dunit_tspeed(typ);
	split(Dunit_v(typ), ',', 4);
	G.v_acceleration = Float(G.splits[0]);
	G.v_friction = Float(G.splits[1]);
	G.v_steering = Int(G.splits[2]);
	G.v_maxdepth = Int(G.splits[3]);
	G.v_flyspeed = Float(G.splits[4]);
}
