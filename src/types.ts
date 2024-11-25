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
	instanceSize: string
	instanceImage: string
	instancePublicKeyId: number
	user: string
	passphrase: string
	proxyLocalTestPort: number
	proxyLocalPort: number
	proxyRemotePort: number
	keyAlgorithm: string
	keyPath: string
	connectionString: string
	appId: string
	loopIntervalSec: number
	sshPort: number
	hostKey: string
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
    LOOP_INTERVAL_SEC: number
    TUNNEL_CONNECT_TIMEOUT_SEC: number
    SSH_PORT: number
    SSH_PORT_RANGE: number[]
    PROXY_LOCAL_TEST_PORT: number
    PROXY_LOCAL_PORT: number
    PROXY_REMOTE_PORT: number
    KEY_ALGORITHM: string
    KEY_LENGTH: number
    INSTANCE_PROVIDERS: InstanceProvider[]
    DIGITAL_OCEAN_API_KEY: string | undefined
    HETZNER_API_KEY: string | undefined
    VULTR_API_KEY: string | undefined
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_KEY: string
    CLOUDFLARE_KV_NAMESPACE: string
    TEST_PROXY_URL: string
    PROXY_URL: string
    DIGITAL_OCEAN_BASE_URL: string
    HETZNER_BASE_URL: string
    VULTR_BASE_URL: string
    CLOUDFLARE_BASE_URL: string
    __DIRNAME: string
    ENV_PATH: string
    HOME_PATH: string
    DATA_PATH: string
    KEY_PATH: string
    TMP_PATH: string
    LOG_PATH: string
    KNOWN_HOSTS_PATH: string
    DB_FILE_NAME: string
    SSH_LOG_EXTENSION: string
    USER: string
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
    WEB_SOCKET_PORT: number
    PROXY_AUTO_CONNECT: boolean
}

export type Proxies = Record<string, Proxy>

export type DatabaseData = Record<DatabaseKey, Proxies | Config>
