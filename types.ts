export enum Types {
	A = 'a',
	B = 'b',
	C = 'c'
}

export interface Connection {
	dropletId: number
	dropletName: string
	dropletIp: string
	dropletRegion: string
	dropletSize: string
	rotationId: number
	type: Types
	user: string
	passphrase: string
	localTestPort: number
	localPort: number
	remotePort: number
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

export interface Connect {
	cmd: string
	type: string
	strictHostKeyChecking: string
    dropletId: number
    dropletIp: string
}