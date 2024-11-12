export interface Provider {
	instanceSize: string
	instanceImage: string
}

export type Providers = Record<string, Provider>;

export enum ConnectionTypes {
	A = 'a'
}

export enum InstanceProviders {
	DIGITAL_OCEAN = 'digital_ocean',
	HETZNER = 'hetzner',
}

export interface Connection {
	connectionUuid: string
	connectionType: ConnectionTypes
	instanceProvider: InstanceProviders
	instanceId: number
	instanceName: string
	instanceIp: string
	instanceRegion: string
	instanceSize: string
	instanceImage: string
	instancePublicKeyId: number
	user: string
	passphrase: string
	localTestPort: number
	localPort: number
	remotePort: number
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
	connections: Connection[];
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