podman rmi lospringliu/roks-enabler:latest 
sleep 3
podman build --platform linux/amd64 -t lospringliu/roks-enabler:latest .
sleep 3
# podman push lospringliu/roks-enabler:latest quay.io/cicdtest/roks-enabler:latest
podman push lospringliu/roks-enabler:latest docker.io/lospringliu/roks-sync:latest  
