import oci
import time
from datetime import datetime

# ── Configuración ──────────────────────────────────────────────────────────────
SUBNET_ID       = "ocid1.subnet.oc1.sa-bogota-1.aaaaaaaas3tbpmrock7mmr77ourt4b63t4a46u7354kvvp4umjnwsjlhgb4a"
DISPLAY_NAME    = "jitsi-callcenter"
IMAGE_ID        = None   # Se busca automáticamente: Ubuntu 24.04 ARM
SHAPE           = "VM.Standard.A1.Flex"
OCPUS           = 4
MEMORY_GB       = 24
BOOT_VOLUME_GB  = 50
REINTENTAR_CADA = 300    # segundos entre intentos (5 minutos)

# Llave SSH pública
SSH_PUBLIC_KEY  = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDFQVuAm41L4c3KOcp+4XlMvX52t/dWlNwoAp+q1+OMXkunZTJabkWDGlDoPeJ6DcqBbyHj0G4cT6x6ViPmoSxNem6GDOIQX6EEnhNiUVo64jLdykHxHtFFHKH1LAWW9vyoMoen2NxfMGsPRVivl6rn+YDs7O9XXhdUvG+6gUOcbbljEm9E7WDgsze8RPBdC4thq7QOyop9xo9Dv1b+c6ag8PQpMIhC9pOnVH5QDBRIYpxWTrFaNq+WwWXKwXRSslw8Te1Z3LLCxUgF+5DSWIcG7XTN4eV0ruh2VLG88gJTAi44GHFoskT4QlCevW3JQ1s6BIYIDAvg1MkW0cZJgftB ssh-key-2026-03-24"
# ──────────────────────────────────────────────────────────────────────────────

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def get_ubuntu_arm_image(compute, compartment_id):
    images = compute.list_images(
        compartment_id=compartment_id,
        operating_system="Canonical Ubuntu",
        operating_system_version="24.04",
        shape=SHAPE,
        sort_by="TIMECREATED",
        sort_order="DESC"
    ).data
    if not images:
        raise Exception("No se encontró imagen Ubuntu 24.04 ARM para A1.Flex")
    return images[0].id

def crear_instancia(compute, config, image_id):
    details = oci.core.models.LaunchInstanceDetails(
        display_name=DISPLAY_NAME,
        compartment_id=config["tenancy"],
        availability_domain="fulB:SA-BOGOTA-1-AD-1",
        shape=SHAPE,
        shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(
            ocpus=OCPUS,
            memory_in_gbs=MEMORY_GB
        ),
        source_details=oci.core.models.InstanceSourceViaImageDetails(
            image_id=image_id,
            boot_volume_size_in_gbs=BOOT_VOLUME_GB
        ),
        create_vnic_details=oci.core.models.CreateVnicDetails(
            subnet_id=SUBNET_ID,
            assign_public_ip=True
        ),
        metadata={
            "ssh_authorized_keys": SSH_PUBLIC_KEY
        }
    )
    return compute.launch_instance(details).data

def main():
    config   = oci.config.from_file()
    compute  = oci.core.ComputeClient(config)

    log("Buscando imagen Ubuntu 24.04 ARM...")
    image_id = get_ubuntu_arm_image(compute, config["tenancy"])
    log(f"Imagen encontrada: {image_id}")

    intento = 1
    while True:
        log(f"Intento #{intento} — creando instancia {DISPLAY_NAME}...")
        try:
            instancia = crear_instancia(compute, config, image_id)
            log(f"✅ ¡Instancia creada exitosamente!")
            log(f"   OCID : {instancia.id}")
            log(f"   Estado: {instancia.lifecycle_state}")
            log("   Espera ~2 minutos a que esté en estado RUNNING.")
            log("   Luego ve a Oracle Console para ver la IP pública.")
            break
        except oci.exceptions.ServiceError as e:
            if "InsufficientServiceCapacity" in str(e.code) or "Out of host capacity" in str(e.message):
                log(f"⚠️  Sin capacidad. Reintentando en {REINTENTAR_CADA // 60} minutos...")
                intento += 1
                time.sleep(REINTENTAR_CADA)
            else:
                log(f"❌ Error inesperado: {e}")
                break

if __name__ == "__main__":
    main()
