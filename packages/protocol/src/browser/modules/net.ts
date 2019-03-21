import * as net from "net";
import { callbackify } from "util";
import { ClientProxy } from "../../common/proxy";
import { NetModuleProxy, NetServerProxy, NetSocketProxy } from "../../node/modules/net";
import { Duplex } from "./stream";

export class Socket extends Duplex<NetSocketProxy> implements net.Socket {
	private _connecting: boolean = false;
	private _destroyed: boolean = false;

	public constructor(proxyPromise: Promise<NetSocketProxy> | NetSocketProxy, connecting?: boolean) {
		super(proxyPromise);
		if (connecting) {
			this._connecting = connecting;
		}
		this.on("close", () => {
			this._destroyed = true;
			this._connecting = false;
		});
		this.on("connect", () => this._connecting = false);
	}

	public connect(options: number | string | net.SocketConnectOpts, host?: string | Function, callback?: Function): this {
		if (typeof host === "function") {
			callback = host;
			host = undefined;
		}
		this._connecting = true;
		if (callback) {
			this.on("connect", callback as () => void);
		}
		this.proxy.connect(options, host);

		return this;
	}

	// tslint:disable-next-line no-any
	public end(data?: any, encoding?: string | Function, callback?: Function): void {
		if (typeof encoding === "function") {
			callback = encoding;
			encoding = undefined;
		}

		callbackify(this.proxy.end)(data, encoding, () => {
			if (callback) {
				callback();
			}
		});
	}

	// tslint:disable-next-line no-any
	public write(data: any, encoding?: string | Function, fd?: string | Function): boolean {
		let callback: undefined | Function;
		if (typeof encoding === "function") {
			callback = encoding;
			encoding = undefined;
		}
		if (typeof fd === "function") {
			callback = fd;
			fd = undefined;
		}
		if (typeof fd !== "undefined") {
			throw new Error("fd argument not supported");
		}

		callbackify(this.proxy.write)(data, encoding, () => {
			if (callback) {
				callback();
			}
		});

		return true; // Always true since we can't get this synchronously.
	}

	public get connecting(): boolean {
		return this._connecting;
	}

	public get destroyed(): boolean {
		return this._destroyed;
	}

	public get bufferSize(): number {
		throw new Error("not implemented");
	}

	public get bytesRead(): number {
		throw new Error("not implemented");
	}

	public get bytesWritten(): number {
		throw new Error("not implemented");
	}

	public get localAddress(): string {
		throw new Error("not implemented");
	}

	public get localPort(): number {
		throw new Error("not implemented");
	}

	public address(): net.AddressInfo | string {
		throw new Error("not implemented");
	}

	public setTimeout(): this {
		throw new Error("not implemented");
	}

	public setNoDelay(): this {
		throw new Error("not implemented");
	}

	public setKeepAlive(): this {
		throw new Error("not implemented");
	}

	public unref(): void {
		this.proxy.unref();
	}

	public ref(): void {
		this.proxy.ref();
	}
}

export class Server extends ClientProxy<NetServerProxy> implements net.Server {
	private readonly sockets = new Map<number, net.Socket>();
	private _listening: boolean = false;

	public constructor(proxyPromise: Promise<NetServerProxy> | NetServerProxy) {
		super(proxyPromise);

		this.proxy.onConnection((socketProxy) => {
			this.emit("connection", new Socket(socketProxy));
		});

		this.on("listening", () => this._listening = true);
	}

	public listen(handle?: net.ListenOptions | number | string, hostname?: string | number | Function, backlog?: number | Function, callback?: Function): this {
		if (typeof hostname === "function") {
			callback = hostname;
			hostname = undefined;
		}
		if (typeof backlog === "function") {
			callback = backlog;
			backlog = undefined;
		}
		if (callback) {
			this.on("listening", callback as () => void);
		}

		this.proxy.listen(handle, hostname, backlog);

		return this;
	}

	public get connections(): number {
		return this.sockets.size;
	}

	public get listening(): boolean {
		return this._listening;
	}

	public get maxConnections(): number {
		throw new Error("not implemented");
	}

	public address(): net.AddressInfo | string {
		throw new Error("not implemented");
	}

	public close(callback?: () => void): this {
		if (callback) {
			this.on("close", callback);
		}
		this.proxy.close();

		return this;
	}

	public ref(): this {
		this.proxy.ref();

		return this;
	}

	public unref(): this {
		this.proxy.unref();

		return this;
	}

	public getConnections(cb: (error: Error | null, count: number) => void): void {
		cb(null, this.sockets.size);
	}
}

type NodeNet = typeof net;

export class NetModule implements NodeNet {
	public readonly Socket: typeof net.Socket;
	public readonly Server: typeof net.Server;

	public constructor(private readonly proxy: NetModuleProxy) {
		// @ts-ignore this is because Socket is missing things from the Stream
		// namespace but I'm unsure how best to provide them (finished,
		// finished.__promisify__, pipeline, and some others) or if it even matters.
		this.Socket = class extends Socket {
			public constructor(options?: net.SocketConstructorOpts) {
				super(proxy.createSocket(options));
			}
		};

		this.Server = class extends Server {
			public constructor(options?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean } | ((socket: Socket) => void), listener?: (socket: Socket) => void) {
				super(proxy.createServer(typeof options !== "function" ? options : undefined));
				if (typeof options === "function") {
					listener = options;
				}
				if (listener) {
					this.on("connection", listener);
				}
			}
		};
	}

	public createConnection(target: string | number | net.NetConnectOpts, host?: string | Function, callback?: Function): net.Socket {
		if (typeof host === "function") {
			callback = host;
			host = undefined;
		}

		const socket = new Socket(this.proxy.createConnection(target, host), true);
		if (callback) {
			socket.on("connect", callback as () => void);
		}

		return socket;
	}

	public createServer(
		options?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean } | ((socket: net.Socket) => void),
		callback?: (socket: net.Socket) => void,
	): net.Server {
		if (typeof options === "function") {
			callback = options;
			options = undefined;
		}

		const server = new Server(this.proxy.createServer(options));
		if (callback) {
			server.on("connection", callback);
		}

		return server;
	}

	public connect(): net.Socket {
		throw new Error("not implemented");
	}

	public isIP(_input: string): number {
		throw new Error("not implemented");
	}

	public isIPv4(_input: string): boolean {
		throw new Error("not implemented");
	}

	public isIPv6(_input: string): boolean {
		throw new Error("not implemented");
	}
}
