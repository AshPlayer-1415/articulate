# Supply a reviewed official Node image digest; there is no mutable default.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /worker
COPY --chown=65532:65532 worker.mjs /worker/worker.mjs
USER 65532:65532
ENTRYPOINT ["node", "--disable-warning=ExperimentalWarning", "/worker/worker.mjs"]
