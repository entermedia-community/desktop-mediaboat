package org.entermediadb.mediaboat;

import java.util.Collection;

import org.json.simple.JSONObject;

public class AppController
{
	EnterMediaModel model;//
	
	public EnterMediaModel getModel()
	{
		 if (model == null)
		{
			model = new EnterMediaModel();
			
		}
		return model;
	}
	
	public Configuration getConfig()
	{
		return getModel().getConfig();
	}
	public boolean connect(String server, String inUname, String inPass)
	{
		return getModel().connect(server,inUname,inPass);
		//Send client info
		
	}
	public void download(JSONObject inMap)
	{
		Collection datapaths = (Collection)inMap.get("assetpaths");
		
		getModel().download(datapaths);
		
	}
	//has connection
	//has UI
	//has API
	public void logoff()
	{
		getModel().disconnect();
		System.exit(0);
		
	}
	
}
