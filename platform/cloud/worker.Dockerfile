FROM hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521
USER root
WORKDIR /workspace
COPY workers ./workers
COPY adapters ./adapters
COPY examples ./examples
COPY platform/commercial ./platform/commercial
COPY LICENSE ./LICENSE
COPY platform/cloud/worker-entry.py /opt/register-worker-entry.py
RUN mkdir -p /workspace/.runtime/eda && chown -R 1000:1000 /workspace/.runtime
USER 1000:1000
ENV MOS_BIND=0.0.0.0 MOS_PORT=8765 MOS_STATE=/workspace/.runtime/eda
ENTRYPOINT ["/bin/bash", "-lc"]
CMD ["exec python3 /opt/register-worker-entry.py"]
