export interface Provider {
	instanceSize: string
	instanceImage: string
}

export type Providers = Record<string, Provider>

export enum NodeType {
	A = 'a'
}
export enum LoopStatus {
	ACTIVE = 'active',
	INACTIVE = 'inactive',
	FINISHED = 'finished',
}

export enum ConnectionType {
	SSH = 'ssh',
	WIREGUARD = 'wireguard',
}

export enum ConnectionStatus {
	CONNECTED = 'connected',
	CONNECTING = 'connecting',
	DISCONNECTED = 'disconnected',
}

export enum InstanceProvider {
	EXOSCALE = 'exoscale',
	HETZNER = 'hetzner',
}

export interface Node {
	nodeUuid: string
	nodeType: NodeType
	proxyLocalPort: number
	proxyRemotePort: number
	tunnelsEnabled: Tunnel[]
	instanceProvider: InstanceProvider
	instanceApiBaseUrl: string
	instanceId: string
	instanceName: string
	instanceIp: string
	instanceRegion: string
	instanceCountry: string
	instanceSize: string
	instanceImage: string
	connectionType: ConnectionType
	wireguardHost: string
	sshUser: string
	sshKeyAlgorithm: string
	sshKeyLength: number;
	clientKeyPath: string
	appId: string
	tunnelPort: number
	serverPublicKey: string
	sshLogPath: string
	jwtSecret: string
	isDeleted: false
	connectedTime: string | null
	createdTime: string
	modifiedTime: string | null
	deletedTime: string | null
}

export enum DatabaseKey {
	NODES = 'nodes',
	CONFIG = 'config'
}

export interface CreateHetznerInstance {
	datacenter: string
	image: string
	name: string
	server_type: string
	user_data: string
}

export interface CreateExoscaleInstance {
	'name': string
	'instance-type': Record<string, string>
	'public-ip-assignment': string
	'security-groups': Record<string, string>[]
	'ssh-key': Record<string, string>
	'user-data': string
	'template': Record<string, unknown>
	'disk-size': number
}

export type InstancePayload = CreateHetznerInstance & CreateExoscaleInstance

export enum Tunnel {
	WIREGUARD = 'wireguard',
	SSHUTTLE = 'sshuttle',
	HTTP_PROXY = 'httpProxy',
	SOCKS5_PROXY = 'socks5Proxy',
}

export enum Side {
	CLIENT = 'client',
	SERVER = 'server',
}

export enum Platform {
	LINUX = 'linux',
	DARWIN = 'darwin',
}

export enum Action {
	MAIN = 'main',
	KILLSWITCH = 'killswitch',
}

export enum Script {
	PREPARE = 'prepare',
	ENABLE = 'enable',
	DISABLE = 'disable',
}

export type Scripts = Record<string, (() => string) | ((node: Node | null) => string)>

export type Actions = Record<string, Scripts>

export type Platforms = Record<string, Actions>

export type Sides = Record<string, Platforms>

export type Tunnels = Record<string, Sides>

export interface Config {
	APP_ID: string
	ENV: string
	PLATFORM: Platform
	LOOP_STATUS: LoopStatus
	CONNECTION_STATUS: ConnectionStatus
	NODE_RECYCLE_INTERVAL_SEC: number
	NODE_RESERVE_COUNT: number
	NODE_CURRENT_RESERVE_COUNT: number
	TUNNEL_KILLSWITCH: boolean
	AUTO_LAUNCH_WEB: boolean
	PROXY_LOCAL_PORT: number
	PROXY_REMOTE_PORT: number
	TUNNEL_PORT_RANGE: string
	SSH_KEY_ALGORITHM: string
	SSH_KEY_LENGTH: number
	EXOSCALE_API_KEY: string
	EXOSCALE_API_SECRET: string
	HETZNER_API_KEY: string
	CLOUDFLARE_ACCOUNT_ID: string
	CLOUDFLARE_API_KEY: string
	CLOUDFLARE_KV_NAMESPACE: string
	HOME_PATH: string
	DATA_PATH: string
	KEY_PATH: string
	UI_PATH: string
	LOG_PATH: string
	SSH_PATH: string
	SSH_KNOWN_HOSTS_PATH: string
	WIREGUARD_CONFIG_PATH: string
	WIREGUARD_HOST: string
	DB_FILE_PATH: string
	SSH_LOG_EXTENSION: string
	CONNECT_TIMEOUT_SEC: number
	POST_CONNECT_DELAY_SEC: number
	SSHUTTLE_PID_FILE_PATH: string
	NODE_TYPES: NodeType[]
	EXOSCALE_INSTANCE_SIZE: string
	HETZNER_SERVER_TYPE: string
	EXOSCALE_TEMPLATE_NAME: string
	HETZNER_INSTANCE_IMAGE: string
	EXOSCALE_DISK_SIZE: number
	HEARTBEAT_INTERVAL_SEC: number
	EXOSCALE_REQUEST_EXPIRATION_SEC: number
	WEB_SERVER_PORT: number
	WEB_URL: string
	WEB_SOCKET_PORT: number
	APP_ENABLED: boolean
	TUNNELS: Tunnel[]
	TUNNELS_ENABLED: Tunnel[]
	INSTANCE_PROVIDERS: InstanceProvider[]
	INSTANCE_PROVIDERS_DISABLED: InstanceProvider[]
	INSTANCE_COUNTRIES: string[]
	INSTANCE_COUNTRIES_DISABLED: string[]
}

export type Nodes = Record<string, Node>

export type DatabaseData = Record<DatabaseKey, Nodes | Config>