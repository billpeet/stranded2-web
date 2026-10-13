# Network code of the port

The multiplayer and network code of Stranded II is ported line by line
(`udp_functions.ts`, `udp_messages.ts`, `udp_processing.ts`, `tcpcommands.ts`,
`mp_usgn.ts`, `mp_game.ts`, `mp_game_functions.ts` in the parent directory).
It talks to the outside only through the `Network` interface `NET` of
`../sys.ts`. **No transport is implemented.** The default `NET` answers like
a machine without a network.

This directory holds:

- `loopback.ts`: an in-memory `Network` for tests. It connects game runtimes
  that live in one process (`tests/game/net_*.test.ts`). It is optional,
  nothing of the game imports it, and it is not a way to play.
- this file.

## What a browser can and cannot do

A web page has no UDP sockets and no raw TCP sockets. It can open HTTP(S)
requests (`fetch`), WebSockets (to a server that speaks WebSocket) and WebRTC
data channels (to a peer, after signalling through a server). Therefore, in a
browser and without help from a server:

| original | in a browser |
| --- | --- |
| `CreateUDPStream`, `SendUDPMsg`, `RecvUDPMsg`: the game protocol | impossible |
| `OpenTCPStream("usgn.unrealsoftware.de",80)`: master server | impossible as written (raw TCP, plain HTTP without version) |
| `OpenTCPStream(server,80)` of the script commands `downloadfile` / `callscript` | impossible as written; a `fetch` could stand in only for hosts that allow cross-origin requests |
| hosting a game (`usgn_hostserver`): a listening UDP port others can reach | impossible |

With the default transport: `CreateUDPStream` gives 0 and `OpenTCPStream`
gives 0, so

- `usgn_setup()` / `usgn_joinserver()` raise `RuntimeError("Failed to
  initialize UDP Sockets")`, `usgn_hostserver()` raises `"Failed to create
  server at UDP Port <port>!"`. That is what the original does when sockets
  fail, and it ends the program. The multiplayer menu is only reachable when
  the mod's `sys\game.inf` has `menu_multiplayer=1`; the shipped mod has 0.
- `downloadfile` and `callscript` print `ERROR: Unable to connect to
  '<server>'` to the console and return 0.

## The original protocols

All of it is documented where it is ported; in short:

**Master server (U.S.G.N.)**, TCP to `usgn.unrealsoftware.de:80`. One request
line ended by CR LF, without HTTP version and without headers, so the answer
is the bare document, read line by line:

- `GET http://usgn.unrealsoftware.de/game_stranded2/ips.txt`: line 1 the
  current version, line 2 a message for the menu, then one `a.b.c.d:port` per
  line.
- `GET http://usgn.unrealsoftware.de/game_stranded2/save.php?port=<port>`:
  registers the caller as a server; line 1 of the answer is the caller's IP.
- `GET http://usgn.unrealsoftware.de/getip.php`: line 1 is the caller's IP.

**Script downloads**, TCP to `<server>:80`: `GET http://<server>/<path>
HTTP/1.1`, `Host`, `User-Agent: Stranded II`, `Accept: */*`, empty line; the
body is read after the header (`Content-Length` bytes for `downloadfile`,
lines until the server closes for `callscript`).

**Game protocol**, UDP, default port from the settings:

- 1 byte datagrams: `10` connection request, `20` accepted, `21` already
  connected, `31` not a host; `100` server info request, answered by `101`,
  name, map (Blitz strings: 32 bit length + bytes), players, max players,
  password flag.
- Packets: a 16 bit id, then messages, every message byte XOR 5. Even ids are
  reliable packets (2, 4, .. 65534, then 0), odd ids unreliable ones. System
  messages (`255` acknowledge + id, `254` request + id) come first.
- Messages: `1` join request, `2` join answer, `3` join steps and player
  data, `5` ping, `50` position, `100` chat and server messages
  (`udp_processing.ts`).

The reliability layer and the game messages have bugs in the original, and
the port keeps them (they are marked `// quirk:` in the code and pinned by
the tests): an acknowledgement dumps one packet too many, the id wrap loses a
packet, `udp_w_int` sends 16 bits, a request packet is processed as garbage,
stale bytes after system messages are read as message ids, and more. The
shipped multiplayer was an unfinished test version.

## What a relay would have to provide

To back `NET` (`setNetwork()` in `../sys.ts`) with a WebSocket or WebRTC
relay, the relay side and the adapter in the page must together provide:

1. **Datagram semantics.** `SendUDPMsg(stream, data, ip, port)` sends one
   datagram; `RecvUDPMsg(stream)` returns the next whole datagram with the
   sender's address, or null at once when there is none. No streaming, no
   merging. Loss and reordering are allowed (the game's own layer deals with
   them, as far as it does); a relay that is reliable and ordered (WebSocket)
   is fine too.
2. **Addresses.** The game identifies peers by a 32 bit IP and a port
   (`Tudp_con\ip/port`, `Tunit\player_ip/player_port`) and sends them inside
   messages. The relay has to give every participant a stable (virtual)
   address pair and deliver by it, and `CreateUDPStream(port)` /
   `UDPStreamPort` must agree with it. Address 0.0.0.0 cannot be used: a
   datagram from IP 0 reads as "nothing received".
3. **Synchronous polling, or a change in the game code.** `RecvUDPMsg` is
   called every frame and must not block. That fits a queue filled by
   WebSocket/WebRTC events. But `udp_join()` and the wait loop in
   `usgn_joinserver()` are busy loops of up to 10 s in the original (no
   `Flip`, no `Delay`), and they are ported as such: while they run, the page
   does not get to its event loop, so no message event can fill the queue and
   joining always times out. A real transport needs either a synchronous
   receive path (the game in a worker, the socket in another, a
   SharedArrayBuffer queue between them, which requires cross-origin
   isolation) or these two loops made asynchronous, which changes the
   function index (`udp_join` becomes async).
4. **TCP as request/response.** `OpenTCPStream`, `WriteLine`, `ReadLine`,
   `Eof`, `ReadAvail`, plus `ReadByte` and `TCPStreamIP`, which the
   `Network` interface does not have yet (`../_additions/net.ts`). The reads
   are blocking in Blitz, so the same synchronous problem applies: the relay
   or adapter must have the complete answer before the first read returns.
   The master server answers are tiny and could be fetched ahead of time by a
   proxy; arbitrary script downloads cannot.
5. **A master server.** The original one is addressed by name and plain TCP.
   A relay would have to answer the three requests above itself or pass them
   on.

Hosting in the page is possible only in the sense that the relay forwards
datagrams to a page that runs `usgn_hostserver()`; the page never listens on
a real port.

## Interoperability with original clients

Original programs speak real UDP to real addresses. A page can reach them
only through a **native relay**: a program on a server (or on the player's
machine) that holds real UDP sockets, speaks WebSocket or WebRTC to the page,
and translates each way, byte for byte, one datagram per message. The port's
packets are byte-identical to the original's (see the tests), so no
translation of the content is needed, only of the carrier and of the
addresses: the original peers see the relay's IP and the port of the socket
the relay opened for that page, and whatever addresses the game puts into its
own messages have to be consistent with that. The master server would list
the relay's address, not the page's. None of this exists here.
