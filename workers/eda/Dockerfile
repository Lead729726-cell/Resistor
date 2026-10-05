FROM hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521
WORKDIR /workspace
COPY workers/eda /opt/register-engine/workers/eda
COPY platform/commercial /opt/register-engine/platform/commercial
COPY adapters /opt/register-engine/adapters
COPY examples/sky130 /opt/register-engine/examples/sky130
ENV MOS_BIND=0.0.0.0 MOS_PORT=8765 MOS_WORKSPACE=/workspace MOS_STATE=/workspace/.runtime/eda
EXPOSE 8765
ENTRYPOINT ["/bin/bash", "-lc"]
CMD ["exec python3 /opt/register-engine/workers/eda/bootstrap.py"]
