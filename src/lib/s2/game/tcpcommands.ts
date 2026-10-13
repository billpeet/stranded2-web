/**
 * includes/tcpcommands.bb: the script commands "downloadfile" and
 * "callscript": a plain HTTP/1.1 GET over a TCP stream to port 80.
 *
 * Request, each line ended by CR LF (Blitz WriteLine):
 *
 *     GET http://<server>/<path> HTTP/1.1
 *     Host: <server>
 *     User-Agent: Stranded II
 *     Accept: * / *            (without the spaces)
 *     <empty line>
 *
 * The TCP stream is the transport's (NET of sys.ts); a browser has none.
 */
import { Instr, Int, Left, Lower, Mid, Replace, SEP_LINE, Str, Trim } from '../blitz';
import { TCPReadByte } from './_additions/net';
import { con_add } from './console';
import { Cbmpf_red } from './consts';
import { CloseFile, WriteByte, WriteFile, type Stream } from './files';
import { G } from './state';
import { NET } from './sys';

//############################################ LOADFILE
/** Function tcp_loadfile(server$,path$,localfile$) */
export function tcp_loadfile(server: string, path: string, localfile: string): number {
	G.p_return = '0';
	let file: Stream = 0;
	let tcp = 0;
	let in_ = '';
	let byte = 0;
	let size = 0;
	let gotsize = 0;
	let i = 0;
	//Prepare
	server = Replace(server, '\\', '/');
	path = Replace(path, '\\', '/');
	if (Instr(localfile, ':') !== 0) {
		con_add("ERROR: Absolute path '" + localfile + "' for loadfile command is not allowed", Cbmpf_red);
		return 0;
	}
	//Connect
	tcp = NET.OpenTCPStream(server, 80);
	if (tcp !== 0) {
		//Perform Get
		NET.WriteLine(tcp, 'GET http://' + server + '/' + path + ' HTTP/1.1');
		NET.WriteLine(tcp, 'Host: ' + server);
		NET.WriteLine(tcp, 'User-Agent: Stranded II');
		NET.WriteLine(tcp, 'Accept: */*');
		NET.WriteLine(tcp, '');
		//Read Header
		while (NET.Eof(tcp) === 0) {
			in_ = NET.ReadLine(tcp);
			//Get Size
			if (Lower(Left(in_, 15)) === 'content-length:') {
				in_ = Mid(in_, 16, -1);
				in_ = Trim(in_);
				size = Int(in_);
				gotsize = 1;
			}
			//Header End
			if (in_ === '') break;
		}
		//Get File
		if (gotsize === 1) {
			file = WriteFile(localfile);
			if (file !== 0) {
				for (i = 1; i <= size; i++) {
					if (NET.Eof(tcp) === 0) {
						byte = TCPReadByte(tcp);
						WriteByte(file, byte);
					} else {
						con_add("ERROR: Unable to finish download of 'http://" + server + '/' + path + "' (" + Str(i) + ' of ' + Str(size) + ' Bytes)', Cbmpf_red);
						i = 0;
						break;
					}
				}
				//Close File
				CloseFile(file);
				//Ok?
				// quirk: after a complete loop i is size+1, so this is never true: the command
				// returns 0 for a successful download as well
				if (i === size) G.p_return = '1';
			} else {
				con_add("ERROR: Unable to write '" + localfile + "'", Cbmpf_red);
			}
		} else {
			con_add("ERROR: Unable to download 'http://" + server + '/' + path + "' (file not found or invalid http header)", Cbmpf_red);
		}
		//Close Stream
		NET.CloseTCPStream(tcp);
	} else {
		con_add("ERROR: Unable to connect to '" + server + "'", Cbmpf_red);
	}
	return 0;
}

//############################################ CALLSCRIPT
/** Function tcp_callscript(server$,path$) */
export function tcp_callscript(server: string, path: string): void {
	G.p_return = '0';
	let tcp = 0;
	let in_ = '';
	//Prepare
	server = Replace(server, '\\', '/');
	path = Replace(path, '\\', '/');
	G.pv_buffer = '';
	//Connect
	tcp = NET.OpenTCPStream(server, 80);
	if (tcp !== 0) {
		//Perform Get
		NET.WriteLine(tcp, 'GET http://' + server + '/' + path + ' HTTP/1.1');
		NET.WriteLine(tcp, 'Host: ' + server);
		NET.WriteLine(tcp, 'User-Agent: Stranded II');
		NET.WriteLine(tcp, 'Accept: */*');
		NET.WriteLine(tcp, '');
		//Ok!
		G.p_return = '1';
		//Read Header
		while (NET.Eof(tcp) === 0) {
			in_ = NET.ReadLine(tcp);
			if (in_ === '') break;
		}
		//Read Content
		while (NET.Eof(tcp) === 0) {
			in_ = NET.ReadLine(tcp);
			G.pv_buffer = G.pv_buffer + in_ + SEP_LINE;
		}
		//Close Stream
		NET.CloseTCPStream(tcp);
	} else {
		con_add("ERROR: Unable to connect to '" + server + "'", Cbmpf_red);
	}
}
