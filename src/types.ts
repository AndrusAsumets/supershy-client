export interface Provider {
	instanceSize: string
	instanceImage: string
}

export type Providers = Record<string, Provider>

export enum ConnectionType {
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

export interface Connection {
	connectionUuid: string
	connectionType: ConnectionType
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
	sshLogOutputPath: string
	isDeleted: false
	createdTime: string
	modifiedTime: string | null
	deletedTime: string | null
}

export type DatabaseData = {
	connections: Connection[]
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