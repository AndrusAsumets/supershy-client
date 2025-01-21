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
	DIGITAL_OCEAN = 'digitalOcean',
	EXOSCALE = 'exoscale',
	HETZNER = 'hetzner',
	VULTR = 'vultr',
}

export interface Node {
	nodeUuid: string
	nodeType: NodeType
	proxyLocalPort: number
	proxyRemotePort: number
	pluginsEnabled: Plugin[]
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
	sshUser: string
	sshKeyAlgorithm: string
	sshKeyLength: number;
	clientKeyPath: string
	appId: string
	serverPort: number
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

export interface CreateDigitalOceanInstance {
	region: string
	name: string
	size: string
	image: string
	ssh_keys: [string]
	user_data: string
}

export interface CreateHetznerInstance {
	datacenter: string
	image: string
	name: string
	server_type: string
	user_data: string
}

export interface CreateVultrInstance {
	region: string
	plan: string
	label: string
	os_id: number
	sshkey_id: [string]
	user_data: string
	backups: string
	enable_ipv6: boolean
	disable_public_ipv4: boolean
	user_scheme: string
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

export type InstancePayload = CreateDigitalOceanInstance & CreateHetznerInstance & CreateVultrInstance & CreateExoscaleInstance

export enum Plugin {
	WIREGUARD_VPN = 'wireguardVpn',
	SSHUTTLE_VPN = 'sshuttleVpn',
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

export type Plugins = Record<string, Sides>

export interface Config {
	APP_ID: string
	ENV: string
	PLATFORM: Platform
	LOOP_STATUS: LoopStatus
	CONNECTION_STATUS: ConnectionStatus
	NODE_RECYCLE_INTERVAL_SEC: number
	NODE_RESERVE_COUNT: number;
	NODE_CURRENT_RESERVE_COUNT: number
	CONNECTION_KILLSWITCH: boolean
	AUTO_LAUNCH_WEB: boolean
	PROXY_LOCAL_PORT: number
	PROXY_REMOTE_PORT: number
	SERVER_PORT_RANGE: string
	SSH_KEY_ALGORITHM: string
	SSH_KEY_LENGTH: number
	DIGITAL_OCEAN_API_KEY: string
	EXOSCALE_API_KEY: string
	EXOSCALE_API_SECRET: string
	HETZNER_API_KEY: string
	VULTR_API_KEY: string
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
	DB_FILE_PATH: string
	SSH_LOG_EXTENSION: string
	CONNECT_TIMEOUT_SEC: number
	SSHUTTLE_PID_FILE_PATH: string
	NODE_TYPES: NodeType[]
	DIGITAL_OCEAN_INSTANCE_SIZE: string
	EXOSCALE_INSTANCE_SIZE: string
	HETZNER_SERVER_TYPE: string
	VULTR_INSTANCE_PLAN: string
	DIGITAL_OCEAN_INSTANCE_IMAGE: string
	EXOSCALE_TEMPLATE_NAME: string
	HETZNER_INSTANCE_IMAGE: string
	VULTR_INSTANCE_IMAGE: string
	EXOSCALE_DISK_SIZE: number
	HEARTBEAT_INTERVAL_SEC: number
	WEB_SERVER_PORT: number
	WEB_URL: string
	WEB_SOCKET_PORT: number
	NODE_ENABLED: boolean
	PLUGINS: Plugin[]
	PLUGINS_ENABLED: Plugin[]
	INSTANCE_PROVIDERS: InstanceProvider[]
	INSTANCE_PROVIDERS_DISABLED: InstanceProvider[]
	INSTANCE_COUNTRIES: string[]
	INSTANCE_COUNTRIES_DISABLED: string[]
}

export type Nodes = Record<string, Node>

export type DatabaseData = Record<DatabaseKey, Nodes | Config>