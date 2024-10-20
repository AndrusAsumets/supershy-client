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