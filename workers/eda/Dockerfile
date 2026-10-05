FROM hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521
WORKDIR /workspace
ENV MOS_BIND=0.0.0.0 MOS_PORT=8765 MOS_STATE=/workspace/.runtime/eda
EXPOSE 8765
ENTRYPOINT ["/bin/bash", "-lc"]
CMD ["exec python3 /workspace/workers/eda/server.py"]
