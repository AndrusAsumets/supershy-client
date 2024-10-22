export enum STRICT_HOST_KEY_CHECKING {
	YES = 'StrictHostKeyChecking=yes',
	NO = 'StrictHostKeyChecking=no'
}

export interface ConnectionString {
	passphrase: string
	dropletIp: string
	localPort: number
	remotePort: number
	keyPath: string
	strictHostKeyChecking: STRICT_HOST_KEY_CHECKING
}

export enum Types {
	A = 'a',
	B = 'b',
	C = 'c'
}

export interface Connect {
	connectionString: string
	type: string
	strictHostKeyChecking: string
	dropletId: number
	dropletIp: string
}

export interface Connection {
	connectionId: string
	dropletId: number
	dropletName: string
	dropletIp: string
	dropletRegion: string
	dropletSize: string
	type: Types
	user: string
	passphrase: string
	localTestPort: number
	localPort: number
	remotePort: number
	keyPath: string
	connectionString: string
	appId: string
	loopIntervalMin: number
	loopTimeoutMin: number
	keyAlgorithm: string
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