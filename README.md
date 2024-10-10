# auto-add-key
sudo nano /usr/local/sbin/auto-add-key:
#!/bin/sh
echo $SSH_PASS

sudo chmod +x /usr/local/sbin/auto-add-key


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
deno run --allow-net --allow-run --allow-env --allow-read app.ts TOKEN=