FROM redhat/ubi9

RUN dnf update; du -sh /usr /var /root; dnf install -y nodejs jq xz; du -sh /usr /var /root

ENV IBMCLOUD_APIKEY=
ENV IBMCLOUD_CLUSTER=
ENV IBMCLOUD_REGION=

RUN curl -fsSL https://clis.cloud.ibm.com/install/linux | sh && ibmcloud plugin install ks
RUN curl  https://mirror.openshift.com/pub/openshift-v4/$(uname -m)/clients/ocp/latest/openshift-client-$(uname -s | tr /A-Z/ /a-z/).tar.gz | tar zxf - -C /usr/local/bin; rm -fv /usr/local/bin/kubectl

WORKDIR /workdir
COPY Dockerfile .
COPY in-pod-kubeconfig.sh .
COPY enabler.sh .
COPY entry-point.sh .
COPY package.json .
COPY app.js .

ENTRYPOINT ["./entry-point.sh"]

