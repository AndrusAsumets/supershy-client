export interface Provider {
	instanceSize: string
	instanceImage: string
}

export type Providers = Record<string, Provider>

export enum ProxyType {
	A = 'a'
}

export enum LoopStatus {
	ACTIVE = 'active',
	INACTIVE = 'inactive',
	FINISHED = 'finished',
}

export enum InstanceProvider {
	DIGITAL_OCEAN = 'digital_ocean',
	HETZNER = 'hetzner',
	VULTR = 'vultr',
}

export interface Proxy {
	proxyUuid: string
	proxyType: ProxyType
	instanceProvider: InstanceProvider
	instanceId: string
	instanceName: string
	instanceIp: string
	instanceRegion: string
	instanceCountry: string
	instanceSize: string
	instanceImage: string
	instancePublicKeyId: number
	sshUser: string
	passphrase: string
	proxyLocalPort: number
	proxyRemotePort: number
	sshKeyAlgorithm: string
	sshKeyLength: number;
	sshKeyPath: string
	connectionString: string
	appId: string
	sshPort: number
	sshHostKey: string
	sshLogPath: string
	isDeleted: false
	createdTime: string
	modifiedTime: string | null
	deletedTime: string | null
}

export enum DatabaseKey {
	PROXIES = 'proxies',
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
}

export interface Config {
	APP_ID: string
	ENV: string
	PROXY_RECYCLE_INTERVAL_SEC: number
	AUTO_LAUNCH_WEB: boolean
	SSH_PORT_RANGE: number[]
	PROXY_LOCAL_PORT: number
	PROXY_REMOTE_PORT: number
	SSH_KEY_ALGORITHM: string
	SSH_KEY_LENGTH: number
	DIGITAL_OCEAN_API_KEY: string
	HETZNER_API_KEY: string
	VULTR_API_KEY: string
	CLOUDFLARE_ACCOUNT_ID: string
	CLOUDFLARE_API_KEY: string
	CLOUDFLARE_KV_NAMESPACE: string
	PROXY_URL: string
	DIGITAL_OCEAN_BASE_URL: string
	HETZNER_BASE_URL: string
	VULTR_BASE_URL: string
	CLOUDFLARE_BASE_URL: string
	HOME_PATH: string
	DATA_PATH: string
	SSH_KEY_PATH: string
	UI_PATH: string
	LOG_PATH: string
	SSH_PATH: string
	SSH_KNOWN_HOSTS_PATH: string
	DB_FILE_PATH: string
	SSH_LOG_EXTENSION: string
	SSH_USER: string
	SSH_CONNECTION_TIMEOUT_SEC: number
	PROXY_TYPES: ProxyType[]
	DIGITAL_OCEAN_INSTANCE_SIZE: string
	HETZNER_SERVER_TYPE: string
	VULTR_INSTANCE_PLAN: string
	DIGITAL_OCEAN_INSTANCE_IMAGE: string
	HETZNER_INSTANCE_IMAGE: string
	VULTR_INSTANCE_IMAGE: string
	GENERATE_SSH_KEY_FILE_NAME: string
	CONNECT_SSH_TUNNEL_FILE_NAME: string
	HEARTBEAT_INTERVAL_SEC: number
	WEB_SERVER_PORT: number
	WEB_URL: string
	WEB_SOCKET_PORT: number
	PROXY_ENABLED: boolean
	DIGITAL_OCEAN_REGIONS: Record<string, string>
	INSTANCE_PROVIDERS: InstanceProvider[]
	INSTANCE_PROVIDERS_DISABLED: InstanceProvider[]
	INSTANCE_COUNTRIES: string[]
	INSTANCE_COUNTRIES_DISABLED: string[]
}

export type Proxies = Record<string, Proxy>

export type DatabaseData = Record<DatabaseKey, Proxies | Config>
