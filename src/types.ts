export interface Provider {
	instanceSize: string
	instanceImage: string
}

export type Providers = Record<string, Provider>;

export enum ConnectionTypes {
	A = 'a'
}

export interface Connection {
	connectionUuid: string
	connectionType: ConnectionTypes
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

export interface CreateInstance {
	region: string
	name: string
	size: string
	publicKeyId: string
	userData: string
}