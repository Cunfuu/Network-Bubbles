import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Box, Typography, Grid, Card, CardContent, Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import InfoItem from './InfoItem';
import AmenityItem from './AmenityItem';
import CheckboxInput from './CheckboxInput';

const StyledModal = styled(Modal)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StyledBox = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[5],
  padding: theme.spacing(4),
  outline: 'none',
  maxWidth: '90%',
  maxHeight: '90%',
  overflowY: 'auto',
  borderRadius: theme.shape.borderRadius,
}));

const AmenityGridItem = styled(Grid)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
}));

const EntityDetailModal = ({ open, handleClose, entity, onUpdateEntity }) => {
  const [editedEntity, setEditedEntity] = useState(entity);

  useEffect(() => {
    setEditedEntity(entity);
  }, [entity]);

  const handleInputChange = (field, value) => {
    setEditedEntity(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAmenityChange = (amenity, value) => {
    setEditedEntity(prev => ({
      ...prev,
      amenities: {
        ...prev.amenities,
        [amenity]: value,
      },
    }));
  };

  const handleSave = () => {
    onUpdateEntity(editedEntity);
    handleClose();
  };

  if (!entity) {
    return null;
  }

  return (
    <StyledModal
      open={open}
      onClose={handleClose}
      aria-labelledby="entity-detail-modal-title"
      aria-describedby="entity-detail-modal-description"
    >
      <StyledBox>
        <Typography id="entity-detail-modal-title" variant="h5" component="h2" gutterBottom>
          Entity Details: {editedEntity.name}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <InfoItem label="ID" value={editedEntity.id} />
                <InfoItem label="Name" value={editedEntity.name} onChange={(value) => handleInputChange('name', value)} />
                <InfoItem label="Type" value={editedEntity.type} onChange={(value) => handleInputChange('type', value)} />
                <InfoItem label="Latitude" value={editedEntity.latitude} onChange={(value) => handleInputChange('latitude', parseFloat(value))} />
                <InfoItem label="Longitude" value={editedEntity.longitude} onChange={(value) => handleInputChange('longitude', parseFloat(value))} />
                <InfoItem label="Power (kW)" value={editedEntity.power} onChange={(value) => handleInputChange('power', parseFloat(value))} />
                <InfoItem label="Status" value={editedEntity.status} onChange={(value) => handleInputChange('status', value)} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Connectivity</Typography>
                <InfoItem label="Gateway ID" value={editedEntity.gateway_id} onChange={(value) => handleInputChange('gateway_id', value)} />
                <InfoItem label="Connection Status" value={editedEntity.connection_status} onChange={(value) => handleInputChange('connection_status', value)} />
                {editedEntity.connection_status === 'Disconnected' && (
                  <InfoItem label="Last Seen" value={editedEntity.last_seen ? new Date(editedEntity.last_seen).toLocaleString() : 'N/A'} />
                )}
                <InfoItem label="IP Address" value={editedEntity.ip_address} onChange={(value) => handleInputChange('ip_address', value)} />
                <InfoItem label="Subnet Mask" value={editedEntity.subnet_mask} onChange={(value) => handleInputChange('subnet_mask', value)} />
                <InfoItem label="Gateway Address" value={editedEntity.gateway_address} onChange={(value) => handleInputChange('gateway_address', value)} />
                <InfoItem label="DNS Server" value={editedEntity.dns_server} onChange={(value) => handleInputChange('dns_server', value)} />
                <InfoItem label="Signal Strength (dBm)" value={editedEntity.signal_strength_dbm} onChange={(value) => handleInputChange('signal_strength_dbm', parseFloat(value))} />
                <InfoItem label="Signal Quality (%)" value={editedEntity.signal_quality_percent} onChange={(value) => handleInputChange('signal_quality_percent', parseFloat(value))} />
                <InfoItem label="Network Type" value={editedEntity.network_type} onChange={(value) => handleInputChange('network_type', value)} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Amenities</Typography>
                <Grid container spacing={2}>
                  {Object.entries(editedEntity.amenities || {}).map(([amenity, available]) => (
                    <AmenityGridItem item xs={6} sm={4} md={3} key={amenity}>
                      <AmenityItem
                        amenity={amenity}
                        available={available}
                        onToggle={() => handleAmenityChange(amenity, !available)}
                      />
                    </AmenityGridItem>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Configuration</Typography>
                <InputRow label="Min Power" value={editedEntity.config?.min_power} onChange={(value) => handleInputChange('config', { ...editedEntity.config, min_power: parseFloat(value) })} />
                <InputRow label="Max Power" value={editedEntity.config?.max_power} onChange={(value) => handleInputChange('config', { ...editedEntity.config, max_power: parseFloat(value) })} />
                <InputRow label="Scheduled Start Time" value={editedEntity.config?.scheduled_start_time} onChange={(value) => handleInputChange('config', { ...editedEntity.config, scheduled_start_time: value })} />
                <InputRow label="Scheduled End Time" value={editedEntity.config?.scheduled_end_time} onChange={(value) => handleInputChange('config', { ...editedEntity.config, scheduled_end_time: value })} />
                <CheckboxInput label="Enable Remote Access" checked={editedEntity.config?.enable_remote_access} onChange={(checked) => handleInputChange('config', { ...editedEntity.config, enable_remote_access: checked })} />
                <CheckboxInput label="Enable Notifications" checked={editedEntity.config?.enable_notifications} onChange={(checked) => handleInputChange('config', { ...editedEntity.config, enable_notifications: checked })} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Chip label="Cancel" onClick={handleClose} color="secondary" clickable />
          <Chip label="Save Changes" onClick={handleSave} color="primary" clickable />
        </Box>
      </StyledBox>
    </StyledModal>
  );
};

EntityDetailModal.propTypes = {
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  entity: PropTypes.object,
  onUpdateEntity: PropTypes.func.isRequired,
};

export default EntityDetailModal;