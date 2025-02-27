<?php
/*+**********************************************************************************
 * The contents of this file are subject to the vtiger CRM Public License Version 1.0
 * ("License"); You may not use this file except in compliance with the License
 * The Original Code is:  vtiger CRM Open Source
 * The Initial Developer of the Original Code is vtiger.
 * Portions created by vtiger are Copyright (C) vtiger.
 * All Rights Reserved.
 ************************************************************************************/
require_once 'include/events/SqlResultIterator.inc';
require_once 'VTWorkflowManager.inc';
require_once 'VTEntityCache.inc';
require_once 'include/Webservices/Utils.php';
require_once 'modules/Users/Users.php';
require_once 'include/Webservices/VtigerCRMObject.php';
require_once 'include/Webservices/VtigerCRMObjectMeta.php';
require_once 'include/Webservices/DataTransform.php';
require_once 'include/Webservices/WebServiceError.php';
require_once 'include/utils/utils.php';
require_once 'include/Webservices/ModuleTypes.php';
require_once 'include/Webservices/Retrieve.php';
require_once 'include/Webservices/Update.php';
require_once 'include/Webservices/WebserviceField.php';
require_once 'include/Webservices/EntityMeta.php';
require_once 'include/Webservices/VtigerWebserviceObject.php';
require_once 'VTWorkflowUtils.php';

class VTWorkflowEventHandler extends VTEventHandler {

	/**
	 * Push tasks to the task queue if the conditions are true
	 * @param string event name being triggered
	 * @param VTEntityData object representing the entity
	 */
	public function handleEvent($eventName, $entityData) {
		$util = new VTWorkflowUtils();
		$user = $util->adminUser();
		global $adb;
		$isNew = $entityData->isNew();
		$entityCache = new VTEntityCache($user);
		$crmid = $entityData->getId();
		$wsId = vtws_getWebserviceEntityId($entityData->getModuleName(), $crmid);
		$entityData = $entityCache->forId($wsId);
		$wfs = new VTWorkflowManager($adb);
		$workflows = $wfs->getWorkflowsForModule($entityData->getModuleName(), true);

		foreach ($workflows as $workflow) {
			if (!is_a($workflow, 'Workflow')) {
				continue;
			}
			switch ($workflow->executionCondition) {
				case VTWorkflowManager::$ON_RELATE:
				case VTWorkflowManager::$ON_UNRELATE:
					// these are processed in WorkflowRelationEventHandler.php
					continue 2;
				case VTWorkflowManager::$ON_FIRST_SAVE:
					if ($isNew) {
						$doEvaluate = true;
					} else {
						$doEvaluate = false;
					}
					break;
				case VTWorkflowManager::$ONCE:
					$doEvaluate = !($workflow->isCompletedForRecord($crmid));
					break;
				case VTWorkflowManager::$ON_EVERY_SAVE:
					$doEvaluate = true;
					break;
				case VTWorkflowManager::$ON_MODIFY:
					$doEvaluate = !($isNew);
					break;
				case VTWorkflowManager::$ON_DELETE:
					$doEvaluate = ($eventName=='vtiger.entity.beforedelete');
					break;
				case VTWorkflowManager::$MANUAL:
				case VTWorkflowManager::$ON_SCHEDULE:
				case VTWorkflowManager::$RECORD_ACCESS_CONTROL:
					$doEvaluate = false;
					break;
				default:
					throw new LogicException('Should never come here! Execution Condition:' . $workflow->executionCondition);
			}
			if ($doEvaluate && $workflow->activeWorkflow() && $workflow->evaluate($entityCache, $entityData->getId())) {
				$entity_id = vtws_getIdComponents($entityData->getId());
				$entity_id = $entity_id[1];
				$workflow->performTasks($entityData);
				if (VTWorkflowManager::$ONCE == $workflow->executionCondition) {
					$workflow->markAsCompletedForRecord($entity_id);
				}
			}
		}
		$util->revertUser();
	}
}
?>
