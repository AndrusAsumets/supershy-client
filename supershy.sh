#!/bin/bash

until deno run --allow-all app.ts
do
    echo "Restarting App"
    sleep 1
done
