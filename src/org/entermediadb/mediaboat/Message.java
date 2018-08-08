package org.entermediadb.mediaboat;

import java.util.HashMap;

public class Message extends HashMap
{
	public Message(String inString)
	{
		setCommand(inString);
	}

	public String getCommand()
	{
		return (String)get("command");
	}
	
	public void setCommand(String inCommand)
	{
		put("command",inCommand);
	}
	
	public String getUser()
	{
		return (String)get("user");
	}
	
	public void setUser(String inUser)
	{
		put("user",inUser);
	}

	public String getDesktop()
	{
		return (String)get("desktopid");
	}
	
	public void setDesktop(String inDesktop)
	{
		put("desktopid",inDesktop);
	}
	
}


