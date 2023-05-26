#!/bin/bash

# NODE_BINARY=node-v18.16.0-linux-$(uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/');
# curl https://nodejs.org/dist/v18.16.0/$NODE_BINARY.tar.xz | tar Jxf -;
# ln -sf /$NODE_BINARY/bin/node /usr/local/bin/node;
# ln -sf /$NODE_BINARY/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm;
# ln -sf /$NODE_BINARY/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx;

ibmcloud login --apikey ${IBMCLOUD_APIKEY} -r ${IBMCLOUD_REGION};
ibmcloud oc cluster ls;

source in-pod-kubeconfig.sh

if ! oc get nodes --insecure-skip-tls-verify=true; then
  ibmcloud oc cluster config -c ${IBMCLOUD_CLUSTER} --admin;
fi

if ! oc get nodes --insecure-skip-tls-verify=true; then
  echo !!!! oc not configured
  exit
fi

# backup
[ -f /host/.docker/config.json.backup ] && echo global pull secret intialized already || (cp /host/.docker/config.json /host/.docker/config.json.backup; echo vanilla > /host/version; cat /host/version)
[ -f /host/etc/containers/registries.conf.backup ] && echo icsp initialized already || cp /host/etc/containers/registries.conf /host/etc/containers/registries.conf.backup

npm install

node app.js
