# create droplet
curl -X POST "https://api.digitalocean.com/v2/droplets" \
	-d'{"name":"My-Droplet","region":"ams3","size":"s-1vcpu-512mb-10gb","image":"debian-12-x64"}' \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json"


# read all droplets
curl -X GET "https://api.digitalocean.com/v2/droplets" \
        -H "Authorization: Bearer $TOKEN"


# delete droplet
curl -X DELETE "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" \
	-H "Authorization: Bearer $TOKEN" \
	-H "Content-Type: application/json"


# run app
deno run --allow-all app.ts -t {DIGITAL_OCEAN_API_KEY} -r 10


# Digital Ocean token scopes
Fully Scoped Access
regions (1): read
1 scope
Create Access
ssh_key / droplet
2 scopes
Read Access
ssh_key / droplet
2 scopes
Delete Access
ssh_key / droplet
2 scopes
Total Custom Scopes
7 scopes

// httping -x localhost:8888 -g http://google.com
// /etc/profile.d/proxy.sh