export enum STRICT_HOST_KEY_CHECKING {
	YES = 'StrictHostKeyChecking=yes',
	NO = 'StrictHostKeyChecking=no'
}

export enum ConnectionTypes {
	A = 'a'
}

export interface Connection {
	connectionId: string
	connectionType: ConnectionTypes
	dropletId: number
	dropletName: string
	dropletIp: string
	dropletRegion: string
	dropletSize: string
	dropletPublicKeyId: number
	user: string
	passphrase: string
	localTestPort: number
	localPort: number
	remotePort: number
	keyAlgorithm: string
	keyPath: string
	connectionString: string
	appId: string
	loopIntervalMin: number
	loopTimeoutMin: number
	sshLogOutputPath: string
	isDeleted: false
	createdTime: string
	modifiedTime: string | null
	deletedTime: string | null
}

export type DatabaseData = {
	connections: Connection[];
}

export interface CreateDroplet {
	region: string
	name: string
	size: string
	publicKeyId: string
	userData: string
}